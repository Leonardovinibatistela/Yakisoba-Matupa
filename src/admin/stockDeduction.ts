import type { OrderLineItem } from "../orders";
import type { Recipes } from "./recipes";
import { resolveRecipeItemId } from "./recipeIds";
import { collection, doc, runTransaction, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase";

export { resolveRecipeItemId };

export type ItemConsumption = { itemId: string; consumption: { ingredientId: string; quantity: number }[] };
export type IngredientUsage = { consumptions: ItemConsumption[]; missingItemIds: string[] };

/** Calcula, item por item, quanto de cada ingrediente ele consome pela ficha técnica. Item sem ficha técnica entra em missingItemIds e não gera consumo nenhum. */
export function computeIngredientUsage(items: OrderLineItem[], recipes: Recipes): IngredientUsage {
  const consumptions: ItemConsumption[] = [];
  const missingItemIds: string[] = [];
  items.forEach((item) => {
    const recipeItemId = resolveRecipeItemId(item.id);
    const recipe = recipes[recipeItemId];
    if (!recipe || recipe.length === 0) { missingItemIds.push(recipeItemId); return; }
    consumptions.push({ itemId: recipeItemId, consumption: recipe.map(({ ingredientId, quantity }) => ({ ingredientId, quantity: quantity * item.quantity })) });
  });
  return { consumptions, missingItemIds };
}

/** Soma o consumo por item num total por ingrediente — usado pra saber quanto descontar de cada ingrediente no estoque. */
export function totalUsageByIngredient(consumptions: ItemConsumption[]): Record<string, number> {
  const usage: Record<string, number> = {};
  consumptions.forEach(({ consumption }) => consumption.forEach(({ ingredientId, quantity }) => { usage[ingredientId] = (usage[ingredientId] ?? 0) + quantity; }));
  return usage;
}

/**
 * Desconta do estoque os ingredientes usados por um pedido, e grava no
 * próprio pedido quanto custou (ingredientCost) e exatamente o que foi
 * descontado de cada ingrediente (deductedIngredients — usado depois se o
 * pedido for apagado). Roda dentro de uma transação, então mesmo com o
 * painel aberto em mais de um computador, a baixa acontece só uma vez: a
 * segunda tentativa relê o pedido, vê stockDeducted já true, e não faz nada.
 * Também grava uma linha no extrato de movimentação (stockMovements).
 */
export async function deductStockForOrder(orderId: string): Promise<void> {
  const orderRef = doc(db, "orders", orderId);
  const recipesRef = doc(db, "menuStatus", "recipes");
  await runTransaction(db, async (transaction) => {
    const orderSnap = await transaction.get(orderRef);
    if (!orderSnap.exists()) return;
    const orderData = orderSnap.data();
    if (orderData.stockDeducted) return;

    const recipesSnap = await transaction.get(recipesRef);
    const recipes = (recipesSnap.exists() ? recipesSnap.data().recipes : {}) as Recipes;

    const items = (orderData.items as OrderLineItem[]) ?? [];
    const { consumptions, missingItemIds } = computeIngredientUsage(items, recipes);
    const usage = totalUsageByIngredient(consumptions);
    const ingredientIds = Object.keys(usage);
    const ingredientRefs = ingredientIds.map((id) => doc(db, "ingredients", id));
    const ingredientSnaps = await Promise.all(ingredientRefs.map((ref) => transaction.get(ref)));

    let totalCost = 0;
    const deductedIngredients: { ingredientId: string; quantity: number }[] = [];
    const movementItems: { ingredientId: string; ingredientName: string; quantity: number; unit: string }[] = [];
    const incompleteCostIngredientIds = new Set<string>();
    ingredientIds.forEach((ingredientId, index) => {
      const snap = ingredientSnaps[index];
      const quantityUsed = usage[ingredientId];
      const data = snap.exists() ? snap.data() : null;
      const avgCost = (data?.avgCost as number) ?? 0;
      // Ingrediente nunca comprado (avgCost 0) ou apagado depois de entrar
      // na ficha técnica (doc não existe mais): a contribuição dele conta
      // como 0 no custo, mas o item fica sinalizado como incompleto — NUNCA
      // é tratado como "esse ingrediente realmente não custa nada".
      if (!snap.exists() || avgCost <= 0) incompleteCostIngredientIds.add(ingredientId);
      totalCost += quantityUsed * avgCost;
      if (snap.exists()) {
        const currentStock = (data!.stock as number) ?? 0;
        transaction.update(ingredientRefs[index], { stock: currentStock - quantityUsed });
        deductedIngredients.push({ ingredientId, quantity: quantityUsed });
        movementItems.push({ ingredientId, ingredientName: (data!.name as string) ?? ingredientId, quantity: quantityUsed, unit: (data!.unit as string) ?? "" });
      }
    });

    const incompleteCostItemIds = consumptions.filter(({ consumption }) => consumption.some(({ ingredientId }) => incompleteCostIngredientIds.has(ingredientId))).map(({ itemId }) => itemId);

    transaction.update(orderRef, { stockDeducted: true, ingredientCost: totalCost, missingRecipeItemIds: missingItemIds, incompleteCostItemIds, deductedIngredients });

    // Extrato: só grava linha se realmente descontou algo de algum ingrediente cadastrado.
    if (movementItems.length > 0) {
      transaction.set(doc(collection(db, "stockMovements")), { orderId, orderNumber: (orderData.orderNumber as number) ?? 0, type: "baixa", items: movementItems, createdAt: serverTimestamp() });
    }
  });
}

/**
 * Devolve ao estoque os ingredientes que um pedido já tinha descontado —
 * chamado antes de apagar um pedido. Se o pedido nunca descontou estoque
 * (stockDeducted false), não faz nada. Também grava uma linha no extrato
 * de movimentação (stockMovements) — essa linha continua visível mesmo
 * depois do pedido em si ser apagado de verdade logo em seguida.
 */
export async function restoreStockForOrder(orderId: string): Promise<void> {
  const orderRef = doc(db, "orders", orderId);
  await runTransaction(db, async (transaction) => {
    const orderSnap = await transaction.get(orderRef);
    if (!orderSnap.exists()) return;
    const orderData = orderSnap.data();
    if (!orderData.stockDeducted) return;

    const deductedIngredients = (orderData.deductedIngredients as { ingredientId: string; quantity: number }[]) ?? [];
    const ingredientRefs = deductedIngredients.map((entry) => doc(db, "ingredients", entry.ingredientId));
    const ingredientSnaps = await Promise.all(ingredientRefs.map((ref) => transaction.get(ref)));

    const movementItems: { ingredientId: string; ingredientName: string; quantity: number; unit: string }[] = [];
    deductedIngredients.forEach((entry, index) => {
      const snap = ingredientSnaps[index];
      const exists = snap.exists();
      const data = exists ? snap.data() : null;
      // Ingrediente pode ter sido apagado desde a baixa original — nesse
      // caso não dá pra devolver estoque nele (doc não existe mais), mas a
      // linha do extrato ainda registra que a devolução foi tentada.
      movementItems.push({ ingredientId: entry.ingredientId, ingredientName: exists ? ((data!.name as string) ?? entry.ingredientId) : `${entry.ingredientId} (removido)`, quantity: entry.quantity, unit: exists ? ((data!.unit as string) ?? "") : "" });
      if (exists) {
        const currentStock = (data!.stock as number) ?? 0;
        transaction.update(ingredientRefs[index], { stock: currentStock + entry.quantity });
      }
    });

    transaction.update(orderRef, { stockDeducted: false });

    if (movementItems.length > 0) {
      transaction.set(doc(collection(db, "stockMovements")), { orderId, orderNumber: (orderData.orderNumber as number) ?? 0, type: "devolucao", items: movementItems, createdAt: serverTimestamp() });
    }
  });
}

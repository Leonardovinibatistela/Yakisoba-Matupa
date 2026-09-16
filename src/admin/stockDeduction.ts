import type { OrderLineItem } from "../orders";
import type { Recipes } from "./recipes";
import { doc, runTransaction } from "firebase/firestore";
import { db } from "../firebase";

// Mesmos separadores usados no carrinho do site público (src/App.tsx) pra
// formar o id de acompanhamento ("parentId::addonId") e de unidade extra de
// yaki ("baseId#sufixo"). Duplicado aqui de propósito — App.tsx não exporta
// essas constantes, e o admin não deveria depender do código do site público.
const ADDON_SEPARATOR = "::";
const INSTANCE_SEPARATOR = "#";

/**
 * Acha o id real do prato (ou do acompanhamento) pra buscar na ficha
 * técnica, a partir do id salvo no pedido — que pode ter sufixo de unidade
 * extra de yaki e/ou de acompanhamento junto.
 * Exemplos: "medio-frango" -> "medio-frango" (direto);
 * "medio-frango#abc123" -> "medio-frango" (unidade extra de yaki);
 * "medio-frango::brocolis" -> "brocolis" (acompanhamento);
 * "medio-frango#abc123::brocolis" -> "brocolis" (acompanhamento de uma unidade extra).
 */
export function resolveRecipeItemId(rawId: string): string {
  const addonIndex = rawId.indexOf(ADDON_SEPARATOR);
  if (addonIndex !== -1) return rawId.slice(addonIndex + ADDON_SEPARATOR.length);
  const instanceIndex = rawId.indexOf(INSTANCE_SEPARATOR);
  if (instanceIndex !== -1) return rawId.slice(0, instanceIndex);
  return rawId;
}

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
      }
    });

    const incompleteCostItemIds = consumptions.filter(({ consumption }) => consumption.some(({ ingredientId }) => incompleteCostIngredientIds.has(ingredientId))).map(({ itemId }) => itemId);

    transaction.update(orderRef, { stockDeducted: true, ingredientCost: totalCost, missingRecipeItemIds: missingItemIds, incompleteCostItemIds, deductedIngredients });
  });
}

/**
 * Devolve ao estoque os ingredientes que um pedido já tinha descontado —
 * chamado antes de apagar um pedido. Se o pedido nunca descontou estoque
 * (stockDeducted false), não faz nada.
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

    deductedIngredients.forEach((entry, index) => {
      const snap = ingredientSnaps[index];
      if (!snap.exists()) return;
      const currentStock = (snap.data().stock as number) ?? 0;
      transaction.update(ingredientRefs[index], { stock: currentStock + entry.quantity });
    });

    transaction.update(orderRef, { stockDeducted: false });
  });
}

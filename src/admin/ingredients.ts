import { addDoc, collection, doc, getDocs, onSnapshot, orderBy, query, runTransaction, serverTimestamp, Timestamp, updateDoc, where } from "firebase/firestore";
import { db } from "../firebase";

export type IngredientUnit = "kg" | "l" | "un";
export type Ingredient = { id: string; name: string; unit: IngredientUnit; stock: number; avgCost: number; minStock: number | null };
export type IngredientPurchase = { id: string; ingredientId: string; quantity: number; totalCost: number; createdAt: Date };

/** Novo custo médio por unidade depois de somar uma compra ao estoque existente — média ponderada simples (sem FIFO/lote). */
export function computeWeightedAvgCost(currentStock: number, currentAvgCost: number, purchaseQty: number, purchaseUnitCost: number): number {
  const totalStock = currentStock + purchaseQty;
  if (totalStock <= 0) return purchaseUnitCost;
  return (currentStock * currentAvgCost + purchaseQty * purchaseUnitCost) / totalStock;
}

/** true se o preço unitário digitado numa compra estiver bem fora do custo médio atual (mais de 3x maior ou menor) — usado só pra confirmar com o admin, nunca bloqueia. */
export function isPurchasePriceUnusual(newUnitCost: number, currentAvgCost: number): boolean {
  if (currentAvgCost <= 0) return false;
  return newUnitCost > currentAvgCost * 3 || newUnitCost < currentAvgCost / 3;
}

const ingredientsCollection = collection(db, "ingredients");

export function subscribeIngredients(onUpdate: (ingredients: Ingredient[]) => void, onError?: (error: unknown) => void): () => void {
  return onSnapshot(
    query(ingredientsCollection, orderBy("name")),
    (snapshot) => onUpdate(snapshot.docs.map((docSnap) => {
      const data = docSnap.data();
      return { id: docSnap.id, name: data.name ?? "", unit: (data.unit ?? "un") as IngredientUnit, stock: data.stock ?? 0, avgCost: data.avgCost ?? 0, minStock: (data.minStock as number) ?? null };
    })),
    onError
  );
}

/** Cadastra um ingrediente novo, sem estoque (o estoque entra depois via registerPurchase). */
export async function addIngredient(name: string, unit: IngredientUnit): Promise<void> {
  await addDoc(ingredientsCollection, { name, unit, stock: 0, avgCost: 0 });
}

/** Registra uma compra: soma no estoque, recalcula o custo médio, e grava o histórico da compra. */
export async function registerPurchase(ingredientId: string, quantity: number, totalCost: number): Promise<void> {
  const ingredientRef = doc(db, "ingredients", ingredientId);
  const purchaseRef = doc(collection(db, "ingredientPurchases"));
  const unitCost = totalCost / quantity;
  await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(ingredientRef);
    const data = snap.data() ?? {};
    const currentStock = (data.stock as number) ?? 0;
    const currentAvgCost = (data.avgCost as number) ?? 0;
    const newAvgCost = computeWeightedAvgCost(Math.max(0, currentStock), currentAvgCost, quantity, unitCost);
    transaction.update(ingredientRef, { stock: currentStock + quantity, avgCost: newAvgCost });
    transaction.set(purchaseRef, { ingredientId, quantity, totalCost, createdAt: serverTimestamp() });
  });
}

/** Corrige a quantidade em estoque na mão (perda, quebra, gastou mais que o previsto) sem mexer no custo médio. */
export async function adjustStock(ingredientId: string, newStock: number): Promise<void> {
  await updateDoc(doc(db, "ingredients", ingredientId), { stock: newStock });
}

/** Define o estoque mínimo (o que dispara "precisa comprar" na lista de compras). null remove o mínimo (ingrediente some da lista de "precisa comprar", mas continua na lista geral ordenada). */
export async function setMinStock(ingredientId: string, minStock: number | null): Promise<void> {
  await updateDoc(doc(db, "ingredients", ingredientId), { minStock });
}

const ingredientPurchasesCollection = collection(db, "ingredientPurchases");

/**
 * Todas as compras já registradas, mais recente primeiro. Usado no
 * Financeiro pra mostrar "quanto foi comprado esse mês" mesmo antes de
 * qualquer ficha técnica existir (visão aproximada, ver spec).
 */
export function subscribeIngredientPurchases(onUpdate: (purchases: IngredientPurchase[]) => void, onError?: (error: unknown) => void): () => void {
  return onSnapshot(
    query(ingredientPurchasesCollection, orderBy("createdAt", "desc")),
    (snapshot) => onUpdate(snapshot.docs.map((docSnap) => {
      const data = docSnap.data();
      const createdAt = data.createdAt instanceof Timestamp ? data.createdAt.toDate() : new Date();
      return { id: docSnap.id, ingredientId: data.ingredientId ?? "", quantity: data.quantity ?? 0, totalCost: data.totalCost ?? 0, createdAt };
    })),
    onError
  );
}

/** Custo médio recalculado do ZERO a partir de uma lista de compras — usado ao editar/apagar uma compra, pra nunca ficar em cima de um valor que já sabemos estar errado. */
export function computeAvgCostFromPurchases(purchases: { quantity: number; totalCost: number }[]): number {
  const totalQuantity = purchases.reduce((sum, purchase) => sum + purchase.quantity, 0);
  if (totalQuantity <= 0) return 0;
  const totalCost = purchases.reduce((sum, purchase) => sum + purchase.totalCost, 0);
  return totalCost / totalQuantity;
}

/** Recalcula avgCost do zero (a partir das compras que sobrarem) e ajusta o estoque pela diferença — usado tanto por editPurchase quanto por deletePurchase. newQuantity/newTotalCost nulos = apagar a compra. */
async function savePurchaseEdit(purchaseId: string, ingredientId: string, oldQuantity: number, newQuantity: number | null, newTotalCost: number | null): Promise<void> {
  const otherPurchasesSnap = await getDocs(query(ingredientPurchasesCollection, where("ingredientId", "==", ingredientId)));
  const otherPurchases = otherPurchasesSnap.docs.filter((docSnap) => docSnap.id !== purchaseId).map((docSnap) => ({ quantity: (docSnap.data().quantity as number) ?? 0, totalCost: (docSnap.data().totalCost as number) ?? 0 }));
  const remainingPurchases = newQuantity !== null && newTotalCost !== null ? [...otherPurchases, { quantity: newQuantity, totalCost: newTotalCost }] : otherPurchases;
  const newAvgCost = computeAvgCostFromPurchases(remainingPurchases);
  const stockDelta = (newQuantity ?? 0) - oldQuantity;
  const ingredientRef = doc(db, "ingredients", ingredientId);
  const purchaseRef = doc(db, "ingredientPurchases", purchaseId);
  await runTransaction(db, async (transaction) => {
    const ingredientSnap = await transaction.get(ingredientRef);
    const currentStock = (ingredientSnap.data()?.stock as number) ?? 0;
    transaction.update(ingredientRef, { stock: currentStock + stockDelta, avgCost: newAvgCost });
    if (newQuantity !== null && newTotalCost !== null) transaction.update(purchaseRef, { quantity: newQuantity, totalCost: newTotalCost });
    else transaction.delete(purchaseRef);
  });
}

/** Corrige uma compra registrada errada (ex.: dígito a mais no valor). Recalcula avgCost do zero a partir do histórico — nunca fica em cima do valor errado. */
export async function editPurchase(purchase: IngredientPurchase, newQuantity: number, newTotalCost: number): Promise<void> {
  await savePurchaseEdit(purchase.id, purchase.ingredientId, purchase.quantity, newQuantity, newTotalCost);
}

/** Apaga uma compra lançada por engano. Devolve o estoque que ela tinha somado e recalcula avgCost do zero com o que sobrou. */
export async function deletePurchase(purchase: IngredientPurchase): Promise<void> {
  await savePurchaseEdit(purchase.id, purchase.ingredientId, purchase.quantity, null, null);
}

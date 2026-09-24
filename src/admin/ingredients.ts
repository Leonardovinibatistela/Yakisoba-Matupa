import { addDoc, collection, deleteDoc, doc, getDocs, limit, onSnapshot, orderBy, query, runTransaction, serverTimestamp, Timestamp, updateDoc, where } from "firebase/firestore";
import { db } from "../firebase";
import { computeAvgCostFromPurchases, computeWeightedAvgCost, isPurchasePriceUnusual } from "./costMath";

export { computeAvgCostFromPurchases, computeWeightedAvgCost, isPurchasePriceUnusual };

export type IngredientUnit = "kg" | "g" | "l" | "ml" | "un";
export type Ingredient = { id: string; name: string; unit: IngredientUnit; stock: number; avgCost: number; minStock: number | null; category: string | null };
export type IngredientPurchase = { id: string; ingredientId: string; quantity: number; totalCost: number; createdAt: Date };

const ingredientsCollection = collection(db, "ingredients");

export function subscribeIngredients(onUpdate: (ingredients: Ingredient[]) => void, onError?: (error: unknown) => void): () => void {
  return onSnapshot(
    query(ingredientsCollection, orderBy("name")),
    (snapshot) => onUpdate(snapshot.docs.map((docSnap) => {
      const data = docSnap.data();
      return { id: docSnap.id, name: data.name ?? "", unit: (data.unit ?? "un") as IngredientUnit, stock: data.stock ?? 0, avgCost: data.avgCost ?? 0, minStock: (data.minStock as number) ?? null, category: (data.category as string) ?? null };
    })),
    onError
  );
}

/** Cadastra um ingrediente novo, sem estoque (o estoque entra depois via registerPurchase). */
export async function addIngredient(name: string, unit: IngredientUnit, category: string | null): Promise<string> {
  const ref = await addDoc(ingredientsCollection, { name, unit, stock: 0, avgCost: 0, category });
  return ref.id;
}

/** Corrige o nome de um ingrediente já cadastrado. Fichas técnicas e extrato continuam ligados a ele (usam o id, não o nome). */
export async function renameIngredient(ingredientId: string, name: string): Promise<void> {
  await updateDoc(doc(db, "ingredients", ingredientId), { name });
}

/** Define ou corrige a categoria de um ingrediente já cadastrado (ex: "Carnes", "Bebidas"). null remove a categoria. */
export async function setIngredientCategory(ingredientId: string, category: string | null): Promise<void> {
  await updateDoc(doc(db, "ingredients", ingredientId), { category });
}

/**
 * Apaga um ingrediente cadastrado errado (ex: duplicado). Não apaga o
 * histórico de compras dele — fica guardado do mesmo jeito que o extrato de
 * movimentação de estoque, legível mesmo depois do ingrediente sumir. Se
 * alguma ficha técnica ainda referenciar esse ingrediente, ela passa a
 * contar como custo incompleto (já é o comportamento existente pra
 * ingrediente nunca comprado).
 */
export async function deleteIngredient(ingredientId: string): Promise<void> {
  await deleteDoc(doc(db, "ingredients", ingredientId));
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

/**
 * Define o custo de um ingrediente que ainda não teve compra registrada (usado na importação da planilha do cliente).
 * É só um custo de referência: na primeira compra de verdade, o custo passa a vir da compra (com estoque zerado, a
 * compra vale sozinha — ver computeWeightedAvgCost). Não mexe no estoque.
 */
export async function setIngredientReferenceCost(ingredientId: string, cost: number): Promise<void> {
  await updateDoc(doc(db, "ingredients", ingredientId), { avgCost: cost });
}

/** Define o estoque mínimo (o que dispara "precisa comprar" na lista de compras). null remove o mínimo (ingrediente some da lista de "precisa comprar", mas continua na lista geral ordenada). */
export async function setMinStock(ingredientId: string, minStock: number | null): Promise<void> {
  await updateDoc(doc(db, "ingredients", ingredientId), { minStock });
}

const ingredientPurchasesCollection = collection(db, "ingredientPurchases");

/**
 * As 500 compras mais recentes (de qualquer ingrediente), mais nova
 * primeiro — cobre bem mais que um mês de uso pra qualquer ficha técnica ou
 * pro cálculo de "quanto foi comprado esse mês" no Financeiro. Sem esse
 * limite, essa lista cresce pra sempre (toda compra já registrada desde o
 * início) e o painel fica puxando cada vez mais dado toda vez que abre —
 * corrigir uma compra antiga continua funcionando igual, porque
 * savePurchaseEdit busca o histórico completo daquele ingrediente direto do
 * Firestore, sem depender dessa lista.
 */
export function subscribeIngredientPurchases(onUpdate: (purchases: IngredientPurchase[]) => void, onError?: (error: unknown) => void): () => void {
  return onSnapshot(
    query(ingredientPurchasesCollection, orderBy("createdAt", "desc"), limit(500)),
    (snapshot) => onUpdate(snapshot.docs.map((docSnap) => {
      const data = docSnap.data();
      const createdAt = data.createdAt instanceof Timestamp ? data.createdAt.toDate() : new Date();
      return { id: docSnap.id, ingredientId: data.ingredientId ?? "", quantity: data.quantity ?? 0, totalCost: data.totalCost ?? 0, createdAt };
    })),
    onError
  );
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

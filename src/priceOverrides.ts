import { deleteField, doc, onSnapshot, setDoc } from "firebase/firestore";
import { db } from "./firebase";

// Mesma ideia do soldOut.ts: um único documento guarda todos os preços
// alterados manualmente pelo admin, num mapa { idDoItem: novoPreco }. Item
// sem entrada aqui usa o preço padrão que já vem no código.
const priceOverridesRef = doc(db, "menuStatus", "priceOverrides");

export function subscribePriceOverrides(onUpdate: (prices: Record<string, number>) => void, onError?: (error: unknown) => void): () => void {
  return onSnapshot(
    priceOverridesRef,
    (snap) => onUpdate(snap.exists() ? ((snap.data().prices as Record<string, number>) ?? {}) : {}),
    onError
  );
}

/** Define um preço novo pra um item. Só o admin autenticado pode chamar isso. */
export async function setItemPrice(itemId: string, price: number): Promise<void> {
  await setDoc(priceOverridesRef, { [`prices.${itemId}`]: price }, { merge: true });
}

/** Volta o item pro preço padrão do cardápio (remove o ajuste manual). */
export async function clearItemPrice(itemId: string): Promise<void> {
  await setDoc(priceOverridesRef, { [`prices.${itemId}`]: deleteField() }, { merge: true });
}

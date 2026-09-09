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
  // Importante: o objeto aninhado ({ prices: { [itemId]: price } }) é o
  // jeito certo de fazer merge só numa chave do mapa "prices" — uma chave
  // com ponto direto no nome (ex.: "prices.combo-48") NÃO funciona com
  // setDoc (só o updateDoc entende ponto como caminho aninhado); isso criava
  // um campo literal com ponto no nome, que a leitura nunca olhava — era
  // exatamente por isso que salvar preço "não fazia nada" (a escrita ia pro
  // Firestore certinha, só que pro lugar errado dentro do documento).
  await setDoc(priceOverridesRef, { prices: { [itemId]: price } }, { merge: true });
}

/** Volta o item pro preço padrão do cardápio (remove o ajuste manual). */
export async function clearItemPrice(itemId: string): Promise<void> {
  await setDoc(priceOverridesRef, { prices: { [itemId]: deleteField() } }, { merge: true });
}

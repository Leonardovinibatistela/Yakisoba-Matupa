import { deleteField, doc, onSnapshot, setDoc } from "firebase/firestore";
import { db } from "./firebase";

// Mesma ideia do priceOverrides.ts: um único documento guarda todos os nomes
// alterados manualmente pelo admin, num mapa { idDoItem: nomeNovo }. Item
// sem entrada aqui usa o nome padrão que já vem no código (ou o nome que o
// admin deu quando criou o item pelo painel).
const nameOverridesRef = doc(db, "menuStatus", "nameOverrides");

export function subscribeNameOverrides(onUpdate: (names: Record<string, string>) => void, onError?: (error: unknown) => void): () => void {
  return onSnapshot(
    nameOverridesRef,
    (snap) => onUpdate(snap.exists() ? ((snap.data().names as Record<string, string>) ?? {}) : {}),
    onError
  );
}

/** Define um nome novo pra um item. Só o admin autenticado pode chamar isso. */
export async function setItemName(itemId: string, name: string): Promise<void> {
  // Objeto aninhado, não chave com ponto — ver comentário em setItemPrice
  // (priceOverrides.ts) pra entender por que isso importa.
  await setDoc(nameOverridesRef, { names: { [itemId]: name } }, { merge: true });
}

/** Volta o item pro nome padrão (remove o ajuste manual). */
export async function clearItemName(itemId: string): Promise<void> {
  await setDoc(nameOverridesRef, { names: { [itemId]: deleteField() } }, { merge: true });
}

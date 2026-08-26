import { arrayRemove, arrayUnion, doc, onSnapshot, setDoc } from "firebase/firestore";
import { db } from "./firebase";

// Itens "excluídos" do cardápio de fábrica (menuData.ts) pelo admin — não
// apaga nada do código, só esconde o item do site pro público. Reversível a
// qualquer momento (botão "Restaurar" no painel). Mesmo padrão do soldOut.ts.
const hiddenItemsRef = doc(db, "menuStatus", "hiddenItems");

export function subscribeHiddenItems(onUpdate: (ids: Set<string>) => void, onError?: (error: unknown) => void): () => void {
  return onSnapshot(
    hiddenItemsRef,
    (snap) => onUpdate(new Set(snap.exists() ? ((snap.data().itemIds as string[]) ?? []) : [])),
    onError
  );
}

export async function setItemHidden(itemId: string, hidden: boolean): Promise<void> {
  await setDoc(hiddenItemsRef, { itemIds: hidden ? arrayUnion(itemId) : arrayRemove(itemId) }, { merge: true });
}

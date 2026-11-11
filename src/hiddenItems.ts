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

// Itens "deletados de vez" pelo dono (botão "Deletar" embaixo de "Restaurar no site"): somem do site E da lista do painel.
// Ficam guardados no mesmo documento, no campo deletedIds. Todo item deletado entra também em itemIds (os excluídos), então uma
// tela aberta com a versão antiga do site continua escondendo o item do público. Não há botão de desfazer no painel (é de vez);
// pra trazer um item de volta é só tirar o id de deletedIds (e de itemIds) no Firebase.
export function subscribeDeletedItems(onUpdate: (ids: Set<string>) => void, onError?: (error: unknown) => void): () => void {
  return onSnapshot(
    hiddenItemsRef,
    (snap) => {
      const raw = snap.exists() ? snap.data().deletedIds : undefined;
      onUpdate(new Set(Array.isArray(raw) ? raw.filter((id): id is string => typeof id === "string") : []));
    },
    onError
  );
}

export async function deleteItemForever(itemId: string): Promise<void> {
  await setDoc(hiddenItemsRef, { itemIds: arrayUnion(itemId), deletedIds: arrayUnion(itemId) }, { merge: true });
}

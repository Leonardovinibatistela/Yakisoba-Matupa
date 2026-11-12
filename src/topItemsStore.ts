import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { db } from "./firebase";
import { parseTopItems, serializeTopItems } from "./topItems";

// A lista dos itens mais pedidos fica num campo de TEXTO (topItemsJson) do mesmo documento público dos itens excluídos
// (menuStatus/hiddenItems): ele já é de leitura pública e só o admin escreve, então não precisa mexer nas regras do Firebase.
// Só tem ids de itens do cardápio — nenhum dado de cliente.
const topItemsRef = doc(db, "menuStatus", "hiddenItems");

/** Chama onUpdate com a lista atual (vazia se não houver) toda vez que ela mudar. */
export function subscribeTopItems(onUpdate: (ids: string[]) => void, onError?: (error: unknown) => void): () => void {
  return onSnapshot(topItemsRef, (snap) => onUpdate(parseTopItems(snap.exists() ? snap.data().topItemsJson : undefined)), onError);
}

/** Só o painel (admin) chama isso. Merge: não mexe nos outros campos do documento (itens excluídos, ordem, seções). */
export async function saveTopItems(ids: string[]): Promise<void> {
  await setDoc(topItemsRef, { topItemsJson: serializeTopItems(ids) }, { merge: true });
}

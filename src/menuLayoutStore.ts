import { deleteField, doc, onSnapshot, setDoc } from "firebase/firestore";
import { db } from "./firebase";
import { parseLayout, type MenuLayout } from "./menuLayout";

// A ordem do cardápio que o admin escolheu (ver menuLayout.ts) fica no campo "layoutJson" do mesmo documento dos itens
// excluídos (menuStatus/hiddenItems). Motivo: esse documento JÁ é de leitura pública e escrita só do admin nas regras do
// Firebase — assim o site dos clientes lê a ordem sem ninguém precisar mexer nas regras. O campo "itemIds" (itens excluídos)
// não é tocado aqui (setDoc com merge só troca o campo "layoutJson").
const layoutRef = doc(db, "menuStatus", "hiddenItems");

/** Chama onUpdate com a ordem salva, ou null (sem nada salvo / texto estragado) = ordem de fábrica. */
export function subscribeMenuLayout(onUpdate: (layout: MenuLayout | null) => void, onError?: (error: unknown) => void): () => void {
  return onSnapshot(layoutRef, (snap) => onUpdate(snap.exists() ? parseLayout(snap.data().layoutJson) : null), onError);
}

export async function saveMenuLayout(layout: MenuLayout): Promise<void> {
  await setDoc(layoutRef, { layoutJson: JSON.stringify(layout) }, { merge: true });
}

/** "Restaurar ordem de fábrica": apaga só a ordem escolhida. */
export async function resetMenuLayout(): Promise<void> {
  await setDoc(layoutRef, { layoutJson: deleteField() }, { merge: true });
}

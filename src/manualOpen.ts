import { doc, onSnapshot, serverTimestamp, setDoc, Timestamp } from "firebase/firestore";
import { db } from "./firebase";
import type { ManualOpenInfo } from "./manualOpenRule";

// "Abrir agora": o admin abre o site pra pedidos fora do horário normal — antes de abrir (ex.: evento
// na cidade) ou depois de fechar (ex.: sexta cheia). Expira às 2h da manhã seguinte ao dia em que foi ligado
// (ver manualOpenRule.ts), mesmo que ninguém desligue o botão.
const manualOpenRef = doc(db, "menuStatus", "manualOpen");

export function subscribeManualOpen(onUpdate: (info: ManualOpenInfo) => void, onError?: (error: unknown) => void): () => void {
  return onSnapshot(manualOpenRef, (snap) => {
    // "estimate": logo depois de clicar, usa a hora do aparelho em vez de esperar o servidor responder.
    const data = snap.exists() ? snap.data({ serverTimestamps: "estimate" }) : null;
    const openedAt = data?.openedAt instanceof Timestamp ? data.openedAt.toDate() : null;
    onUpdate({ open: !!data?.open, openedAt });
  }, onError);
}

export async function setManualOpen(open: boolean): Promise<void> {
  await setDoc(manualOpenRef, open ? { open, openedAt: serverTimestamp() } : { open }, { merge: true });
}

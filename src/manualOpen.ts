import { doc, onSnapshot, serverTimestamp, setDoc, Timestamp } from "firebase/firestore";
import { db } from "./firebase";
import type { ManualOpenInfo } from "./manualOpenRule";

// Abertura antecipada: admin pode abrir o site pra pedidos antes do horário
// normal (ex.: evento na cidade, quer começar mais cedo). Isso NUNCA empurra
// o horário de fechar — o site sempre fecha sozinho no horário oficial
// (ver storeHours.ts) — e também expira à meia-noite do dia em que foi
// ligada (ver manualOpenRule.ts), mesmo que ninguém desligue o botão.
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

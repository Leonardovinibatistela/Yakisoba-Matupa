import { doc, onSnapshot, serverTimestamp, setDoc, Timestamp } from "firebase/firestore";
import { db } from "./firebase";
import type { ManualCloseInfo } from "./manualCloseRule";

// Fechamento manual: o admin força o site fechado por hoje mesmo dentro do horário normal (loja de mudança,
// feriado, imprevisto). Vence a agenda E a abertura antecipada (ver storeHours.ts, computeStoreOpen). Nunca
// depende de ninguém lembrar de desligar: expira sozinho à meia-noite do dia em que foi ligado (ver
// manualCloseRule.ts) — no dia seguinte o site volta a seguir o horário normal sozinho.
const manualCloseRef = doc(db, "menuStatus", "manualClose");

export function subscribeManualClose(onUpdate: (info: ManualCloseInfo) => void, onError?: (error: unknown) => void): () => void {
  return onSnapshot(manualCloseRef, (snap) => {
    // "estimate": logo depois de clicar, usa a hora do aparelho em vez de esperar o servidor responder.
    const data = snap.exists() ? snap.data({ serverTimestamps: "estimate" }) : null;
    const closedAt = data?.closedAt instanceof Timestamp ? data.closedAt.toDate() : null;
    onUpdate({ closed: !!data?.closed, closedAt });
  }, onError);
}

export async function setManualClose(closed: boolean): Promise<void> {
  await setDoc(manualCloseRef, closed ? { closed, closedAt: serverTimestamp() } : { closed }, { merge: true });
}

import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { db } from "./firebase";

// Abertura antecipada: admin pode abrir o site pra pedidos antes do horário
// normal (ex.: evento na cidade, quer começar mais cedo). Isso NUNCA empurra
// o horário de fechar — o site sempre fecha sozinho no horário oficial
// (ver isBeforeClosingTime em App.tsx), mesmo que esse botão fique ligado.
const manualOpenRef = doc(db, "menuStatus", "manualOpen");

export function subscribeManualOpen(onUpdate: (open: boolean) => void, onError?: (error: unknown) => void): () => void {
  return onSnapshot(manualOpenRef, (snap) => onUpdate(snap.exists() ? !!snap.data().open : false), onError);
}

export async function setManualOpen(open: boolean): Promise<void> {
  await setDoc(manualOpenRef, { open }, { merge: true });
}

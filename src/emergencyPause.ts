import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { db } from "./firebase";

// Botão de emergência: pausa pedido no site na hora (cozinha lotou, faltou
// gás, o que for), sem mexer no horário oficial de funcionamento.
const pauseRef = doc(db, "menuStatus", "emergencyPause");

export function subscribeEmergencyPause(onUpdate: (paused: boolean) => void, onError?: (error: unknown) => void): () => void {
  return onSnapshot(pauseRef, (snap) => onUpdate(snap.exists() ? !!snap.data().paused : false), onError);
}

export async function setEmergencyPause(paused: boolean): Promise<void> {
  await setDoc(pauseRef, { paused }, { merge: true });
}

import { doc, onSnapshot, serverTimestamp, setDoc, Timestamp } from "firebase/firestore";
import { db } from "./firebase";

// Botão de emergência: pausa pedido no site na hora (cozinha lotou, faltou
// gás, o que for), sem mexer no horário oficial de funcionamento.
const pauseRef = doc(db, "menuStatus", "emergencyPause");

export function subscribeEmergencyPause(onUpdate: (paused: boolean) => void, onError?: (error: unknown) => void): () => void {
  return onSnapshot(pauseRef, (snap) => onUpdate(snap.exists() ? !!snap.data().paused : false), onError);
}

/** Igual ao de cima, mas também devolve desde que horas está pausado (usado só no painel do admin). */
export type PauseInfo = { paused: boolean; since: Date | null };

export function subscribeEmergencyPauseInfo(onUpdate: (info: PauseInfo) => void, onError?: (error: unknown) => void): () => void {
  return onSnapshot(pauseRef, (snap) => {
    // "estimate": logo depois de clicar, mostra a hora do aparelho em vez de esperar o servidor responder.
    const data = snap.exists() ? snap.data({ serverTimestamps: "estimate" }) : null;
    const paused = !!data?.paused;
    const pausedAt = data?.pausedAt;
    onUpdate({ paused, since: paused && pausedAt instanceof Timestamp ? pausedAt.toDate() : null });
  }, onError);
}

// Só guarda a HORA (nunca quem pausou): esse documento é público, o site precisa ler.
export async function setEmergencyPause(paused: boolean): Promise<void> {
  await setDoc(pauseRef, paused ? { paused, pausedAt: serverTimestamp() } : { paused, resumedAt: serverTimestamp() }, { merge: true });
}

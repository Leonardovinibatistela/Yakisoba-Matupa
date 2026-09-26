import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { db } from "./firebase";
import { normalizeDeliveryFeeConfig, type DeliveryFeeConfig } from "./deliveryFeeRule";

// Taxa de entrega por distância (regra em deliveryFeeRule.ts). O documento é público pra leitura
// (o site precisa dele pra calcular o total) e só o admin grava. Sem documento, ou com valor
// estranho, o site cobra a taxa fixa de sempre (R$ 7).
const deliveryFeeRef = doc(db, "menuStatus", "deliveryFee");

export function subscribeDeliveryFeeConfig(onUpdate: (config: DeliveryFeeConfig | null) => void, onError?: (error: unknown) => void): () => void {
  return onSnapshot(deliveryFeeRef, (snap) => onUpdate(snap.exists() ? normalizeDeliveryFeeConfig(snap.data()) : null), onError);
}

export async function setDeliveryFeeConfig(config: DeliveryFeeConfig): Promise<void> {
  await setDoc(deliveryFeeRef, config);
}

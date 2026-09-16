import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { db } from "../firebase";

export type PaymentMethod = "pix" | "cartao" | "dinheiro";
export type PaymentFeeRates = Record<PaymentMethod, number>;

const DEFAULT_RATES: PaymentFeeRates = { pix: 0, cartao: 0, dinheiro: 0 };
const paymentFeesRef = doc(db, "menuStatus", "paymentFees");

export function subscribePaymentFeeRates(onUpdate: (rates: PaymentFeeRates) => void, onError?: (error: unknown) => void): () => void {
  return onSnapshot(
    paymentFeesRef,
    (snap) => onUpdate(snap.exists() ? { ...DEFAULT_RATES, ...(snap.data().rates as Partial<PaymentFeeRates>) } : DEFAULT_RATES),
    onError
  );
}

export async function setPaymentFeeRates(rates: PaymentFeeRates): Promise<void> {
  await setDoc(paymentFeesRef, { rates });
}

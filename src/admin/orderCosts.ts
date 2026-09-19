import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { db } from "../firebase";

/** Custos que o pedido tem além dos ingredientes: caixinha/sacola/hashi/molho por pedido, e o que se paga ao motoboy por entrega. Em reais. */
export type OrderCostRates = { packaging: number; courier: number };

export const DEFAULT_ORDER_COST_RATES: OrderCostRates = { packaging: 0, courier: 0 };
const orderCostsRef = doc(db, "menuStatus", "orderCosts");

export function subscribeOrderCostRates(onUpdate: (rates: OrderCostRates) => void, onError?: (error: unknown) => void): () => void {
  return onSnapshot(
    orderCostsRef,
    (snap) => onUpdate(snap.exists() ? { ...DEFAULT_ORDER_COST_RATES, ...(snap.data().rates as Partial<OrderCostRates>) } : DEFAULT_ORDER_COST_RATES),
    onError
  );
}

export async function setOrderCostRates(rates: OrderCostRates): Promise<void> {
  await setDoc(orderCostsRef, { rates });
}

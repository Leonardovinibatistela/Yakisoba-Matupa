import { collection, doc, runTransaction, serverTimestamp } from "firebase/firestore";
import { db } from "./firebase";

export type OrderLineItem = { id: string; name: string; quantity: number; unitPrice: number; lineTotal: number; parentId?: string };

export type OrderPayload = {
  items: OrderLineItem[];
  subtotal: number;
  deliveryFee: number;
  total: number;
  deliveryType: "retirada" | "entrega";
  location: string;
  cutlery: "hashi" | "garfo" | "nenhum";
  paymentMethod: "pix" | "cartao" | "dinheiro";
  notes: string;
};

const countersRef = doc(db, "counters", "orders");
const ordersCollectionRef = collection(db, "orders");

/**
 * Registra um pedido no Firestore com número sequencial real (via transação
 * atômica no contador), pra que a loja consiga ordenar pedidos que chegaram
 * juntos no WhatsApp. Se der qualquer erro (ex.: sem internet), não trava o
 * checkout — quem chama trata a falha e segue mandando pro WhatsApp mesmo assim.
 *
 * O número reinicia em 1 todo dia (compara a data guardada no contador com a
 * data de hoje no fuso do cliente — é a mesma base que já usamos pra saber se
 * a loja está aberta).
 */
export async function registerOrder(payload: OrderPayload): Promise<number> {
  const today = new Date().toLocaleDateString("en-CA");
  const orderNumber = await runTransaction(db, async (transaction) => {
    const counterSnap = await transaction.get(countersRef);
    const data = counterSnap.exists() ? counterSnap.data() : null;
    const isSameDay = data?.date === today;
    const next = isSameDay ? ((data?.current as number) ?? 0) + 1 : 1;
    transaction.set(countersRef, { current: next, date: today });
    const newOrderRef = doc(ordersCollectionRef);
    transaction.set(newOrderRef, { ...payload, orderNumber: next, createdAt: serverTimestamp() });
    return next;
  });
  return orderNumber;
}

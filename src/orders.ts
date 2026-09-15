import { collection, doc, onSnapshot, runTransaction, serverTimestamp } from "firebase/firestore";
import { db } from "./firebase";

export type OrderLineItem = { id: string; name: string; quantity: number; unitPrice: number; lineTotal: number; parentId?: string };

export type OrderPayload = {
  customerName: string;
  customerPhone: string;
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

// O número do pedido acumula normal (não reinicia todo dia) e só volta pro 1
// depois de passar do 100 — pedido do cliente: "se hoje vendeu até o 50,
// amanhã vai pro 51, e quando chegar no 100 o próximo vira o 1".
const MAX_ORDER_NUMBER = 100;
const computeNextOrderNumber = (current: number | undefined): number => ((current ?? 0) >= MAX_ORDER_NUMBER ? 1 : (current ?? 0) + 1);

/**
 * Registra um pedido no Firestore com número sequencial real (via transação
 * atômica no contador), pra que a loja consiga ordenar pedidos que chegaram
 * juntos no WhatsApp. Se der qualquer erro (ex.: sem internet), não trava o
 * checkout — quem chama trata a falha e segue mandando pro WhatsApp mesmo assim.
 */
/**
 * Acompanha ao vivo qual vai ser o PRÓXIMO número de pedido, sem precisar de
 * transação — só pra já mostrar "Pedido #N" na mensagem do WhatsApp na hora
 * do clique (sem atrasar o window.open, que precisa ser síncrono). O número
 * real e definitivo continua sendo o que registerOrder() grava no Firestore;
 * esse aqui é só uma previsão (fica errado só no raríssimo caso de dois
 * pedidos no mesmo segundo exato).
 */
export function subscribeNextOrderNumber(onUpdate: (nextNumber: number) => void, onError?: (error: unknown) => void): () => void {
  return onSnapshot(countersRef, (snap) => {
    const data = snap.exists() ? snap.data() : null;
    onUpdate(computeNextOrderNumber(data?.current as number | undefined));
  }, onError);
}

export async function registerOrder(payload: OrderPayload): Promise<number> {
  const orderNumber = await runTransaction(db, async (transaction) => {
    const counterSnap = await transaction.get(countersRef);
    const data = counterSnap.exists() ? counterSnap.data() : null;
    const next = computeNextOrderNumber(data?.current as number | undefined);
    transaction.set(countersRef, { current: next });
    const newOrderRef = doc(ordersCollectionRef);
    transaction.set(newOrderRef, { ...payload, orderNumber: next, createdAt: serverTimestamp() });
    return next;
  });
  return orderNumber;
}

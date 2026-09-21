import { collection, doc, onSnapshot, runTransaction, serverTimestamp } from "firebase/firestore";
import { db } from "./firebase";
import { retry } from "./retry";

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

/** Código do pedido, sorteado no aparelho do cliente (mesmo formato do Firestore). Fica fixo durante as tentativas de registrar. */
export const newOrderId = (): string => doc(ordersCollectionRef).id;

export async function registerOrder(payload: OrderPayload, orderId?: string): Promise<number> {
  const orderNumber = await runTransaction(db, async (transaction) => {
    const counterSnap = await transaction.get(countersRef);
    const data = counterSnap.exists() ? counterSnap.data() : null;
    const next = computeNextOrderNumber(data?.current as number | undefined);
    transaction.set(countersRef, { current: next });
    // Com código fixo (orderId), tentar de novo depois de uma falha NUNCA cria o
    // mesmo pedido duas vezes: se a primeira tentativa já tinha gravado, a
    // segunda vira uma "edição", que as regras do banco negam pra quem não é
    // admin — a transação inteira falha e o contador não anda.
    const newOrderRef = orderId ? doc(ordersCollectionRef, orderId) : doc(ordersCollectionRef);
    transaction.set(newOrderRef, { ...payload, orderNumber: next, createdAt: serverTimestamp() });
    return next;
  });
  return orderNumber;
}

/**
 * Registra o pedido tentando até 3 vezes (na hora, +1,5s, +4s) — cobre queda
 * curta de internet ou instabilidade do Firebase. Se todas falharem, lança o
 * erro, e quem chama TEM que avisar o cliente (antes isso era engolido em
 * silêncio e o pedido só existia no WhatsApp, sem aparecer no painel).
 */
export const registerOrderWithRetry = (payload: OrderPayload, orderId: string): Promise<number> => retry(() => registerOrder(payload, orderId), [1500, 4000]);

import { Timestamp, deleteField, doc, updateDoc } from "firebase/firestore";
import { db } from "../firebase";

/**
 * Marca (ou desmarca) um pedido como pronto na cozinha. Só mexe no campo kitchenReadyAt do pedido — nada de valores.
 * Usa a hora do aparelho (e não a do servidor) pra o pedido sair da lista de "preparar" na hora, sem esperar o servidor.
 */
export async function setOrderReady(orderId: string, ready: boolean): Promise<void> {
  await updateDoc(doc(db, "orders", orderId), { kitchenReadyAt: ready ? Timestamp.fromDate(new Date()) : deleteField() });
}

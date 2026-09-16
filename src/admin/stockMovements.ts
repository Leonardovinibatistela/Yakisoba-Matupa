import { collection, limit, onSnapshot, orderBy, query, Timestamp } from "firebase/firestore";
import { db } from "../firebase";

export type StockMovementItem = { ingredientId: string; ingredientName: string; quantity: number; unit: string };
export type StockMovement = { id: string; orderId: string; orderNumber: number; type: "baixa" | "devolucao"; items: StockMovementItem[]; createdAt: Date };

const stockMovementsCollection = collection(db, "stockMovements");

/** Extrato de movimentação de estoque — as 200 mais recentes, mais nova primeiro. Continua mostrando um pedido mesmo depois dele ser apagado (é um log, não referencia o pedido original pra exibir). */
export function subscribeStockMovements(onUpdate: (movements: StockMovement[]) => void, onError?: (error: unknown) => void): () => void {
  return onSnapshot(
    query(stockMovementsCollection, orderBy("createdAt", "desc"), limit(200)),
    (snapshot) => onUpdate(snapshot.docs.map((docSnap) => {
      const data = docSnap.data();
      const createdAt = data.createdAt instanceof Timestamp ? data.createdAt.toDate() : new Date();
      return { id: docSnap.id, orderId: data.orderId ?? "", orderNumber: data.orderNumber ?? 0, type: (data.type ?? "baixa") as StockMovement["type"], items: (data.items as StockMovementItem[]) ?? [], createdAt };
    })),
    onError
  );
}

import { collection, getDocs, onSnapshot, query, QuerySnapshot, Timestamp, where } from "firebase/firestore";
import { db } from "../firebase";
import type { OrderLineItem } from "../orders";

export type OrderRecord = {
  id: string;
  orderNumber: number;
  items: OrderLineItem[];
  total: number;
  createdAt: Date;
};

export function startOfDay(date: Date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function endOfDay(date: Date) {
  const d = startOfDay(date);
  d.setDate(d.getDate() + 1);
  return d;
}

export function startOfWeek(date: Date) {
  const d = startOfDay(date);
  const day = d.getDay(); // 0 = domingo
  const diffToMonday = day === 0 ? 6 : day - 1;
  d.setDate(d.getDate() - diffToMonday);
  return d;
}

export function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0);
}

export function endOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 1, 0, 0, 0, 0);
}

function mapSnapshotToOrders(snapshot: QuerySnapshot): OrderRecord[] {
  return snapshot.docs.map((docSnap) => {
    const data = docSnap.data();
    const createdAt = data.createdAt instanceof Timestamp ? data.createdAt.toDate() : new Date();
    return { id: docSnap.id, orderNumber: data.orderNumber ?? 0, items: data.items ?? [], total: data.total ?? 0, createdAt };
  });
}

/** Busca pedidos entre duas datas (usado pro "hoje/semana/mês" ao vivo e pra pesquisa de um dia específico). */
export async function fetchOrdersBetween(from: Date, to: Date): Promise<OrderRecord[]> {
  const ordersQuery = query(collection(db, "orders"), where("createdAt", ">=", Timestamp.fromDate(from)), where("createdAt", "<", Timestamp.fromDate(to)));
  const snapshot = await getDocs(ordersQuery);
  return mapSnapshotToOrders(snapshot);
}

/** Busca tudo desde o início da semana ou do mês (o que vier primeiro) até agora — cobre hoje/semana/mês numa única consulta. */
export async function fetchRecentOrders(): Promise<OrderRecord[]> {
  const now = new Date();
  const monthStart = startOfMonth(now);
  const weekStart = startOfWeek(now);
  const queryStart = weekStart < monthStart ? weekStart : monthStart;
  return fetchOrdersBetween(queryStart, endOfDay(now));
}

/**
 * Igual fetchRecentOrders, mas ao vivo: chama onUpdate toda vez que um pedido
 * novo chega, sem precisar recarregar a página. Retorna a função pra parar de
 * escutar (chamar quando o componente desmontar).
 */
export function subscribeToRecentOrders(onUpdate: (orders: OrderRecord[]) => void, onError: (error: unknown) => void): () => void {
  const now = new Date();
  const monthStart = startOfMonth(now);
  const weekStart = startOfWeek(now);
  const queryStart = weekStart < monthStart ? weekStart : monthStart;
  const ordersQuery = query(collection(db, "orders"), where("createdAt", ">=", Timestamp.fromDate(queryStart)));
  return onSnapshot(ordersQuery, (snapshot) => onUpdate(mapSnapshotToOrders(snapshot)), onError);
}

export function sumRevenue(orders: OrderRecord[]) {
  return orders.reduce((total, order) => total + order.total, 0);
}

export function bestSellers(orders: OrderRecord[], limit: number) {
  const quantityByItem = new Map<string, number>();
  orders.forEach((order) => order.items.forEach((item) => quantityByItem.set(item.name, (quantityByItem.get(item.name) ?? 0) + item.quantity)));
  return Array.from(quantityByItem.entries())
    .map(([name, quantity]) => ({ name, quantity }))
    .sort((a, b) => b.quantity - a.quantity)
    .slice(0, limit);
}

export function ordersInRange(orders: OrderRecord[], from: Date, to?: Date) {
  return orders.filter((order) => order.createdAt >= from && (!to || order.createdAt < to));
}

const weekdayLabels = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

/** Soma o faturamento por dia da semana (domingo a sábado, nessa ordem) para o conjunto de pedidos passado. */
export function revenueByWeekday(orders: OrderRecord[]) {
  const totals = [0, 0, 0, 0, 0, 0, 0];
  orders.forEach((order) => { totals[order.createdAt.getDay()] += order.total; });
  return weekdayLabels.map((label, index) => ({ label, total: totals[index] }));
}

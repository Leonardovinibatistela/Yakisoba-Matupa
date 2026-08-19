import { collection, getDocs, query, Timestamp, where } from "firebase/firestore";
import { db } from "../firebase";
import type { OrderLineItem } from "../orders";

export type OrderRecord = {
  id: string;
  orderNumber: number;
  items: OrderLineItem[];
  total: number;
  createdAt: Date;
};

function startOfDay(date: Date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function startOfWeek(date: Date) {
  const d = startOfDay(date);
  const day = d.getDay(); // 0 = domingo
  const diffToMonday = day === 0 ? 6 : day - 1;
  d.setDate(d.getDate() - diffToMonday);
  return d;
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0);
}

export async function fetchRecentOrders(): Promise<OrderRecord[]> {
  const now = new Date();
  const monthStart = startOfMonth(now);
  const weekStart = startOfWeek(now);
  const queryStart = weekStart < monthStart ? weekStart : monthStart;

  const ordersQuery = query(collection(db, "orders"), where("createdAt", ">=", Timestamp.fromDate(queryStart)));
  const snapshot = await getDocs(ordersQuery);
  return snapshot.docs.map((docSnap) => {
    const data = docSnap.data();
    const createdAt = data.createdAt instanceof Timestamp ? data.createdAt.toDate() : new Date();
    return { id: docSnap.id, orderNumber: data.orderNumber ?? 0, items: data.items ?? [], total: data.total ?? 0, createdAt };
  });
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

export function ordersInRange(orders: OrderRecord[], from: Date) {
  return orders.filter((order) => order.createdAt >= from);
}

export function revenueByDay(orders: OrderRecord[], days: number) {
  const now = new Date();
  const buckets: { label: string; date: Date; total: number }[] = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const date = startOfDay(new Date(now.getTime() - i * 24 * 60 * 60 * 1000));
    buckets.push({ label: date.toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", ""), date, total: 0 });
  }
  orders.forEach((order) => {
    const orderDay = startOfDay(order.createdAt).getTime();
    const bucket = buckets.find((b) => b.date.getTime() === orderDay);
    if (bucket) bucket.total += order.total;
  });
  return buckets;
}

export { startOfDay, startOfWeek, startOfMonth };

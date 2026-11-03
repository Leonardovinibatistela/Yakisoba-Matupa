// Tela da cozinha (só regra — sem Firebase, pra dar pra testar sozinho): tudo que quem cozinha precisa ver pra preparar e
// entregar os pedidos (cliente, telefone, endereço, forma de pagamento...), SEM nenhum valor em R$ (nem preço, nem total, nem taxa).
import type { OrderRecord } from "./adminData";
import { ESTIMATED_MINUTES, parseOrderNotes } from "./receiptLayout";

/** Quantos minutos um pedido fica marcado como "chegou agora" (destaque na tela). */
export const NEW_ARRIVAL_MINUTES = 10;
/** Horário de Matupá (UTC-4) e hora em que o "dia de funcionamento" vira (2h da manhã) — mesmo corte do Abrir/Fechar. */
const STORE_OFFSET_MS = 240 * 60000;
const DAY_START_HOUR = 2;

/** Começo (em ms) do dia de funcionamento em que `ms` caiu: a última 2h da manhã de Matupá. */
export function kitchenDayStart(ms: number): number {
  const shifted = ms - STORE_OFFSET_MS - DAY_START_HOUR * 3600000;
  return Math.floor(shifted / 86400000) * 86400000 + DAY_START_HOUR * 3600000 + STORE_OFFSET_MS;
}

export type KitchenItem = { qty: number; name: string; addons: { qty: number; name: string }[] };
export type KitchenTicket = {
  id: string;
  number: number;
  arrivedAt: Date;
  /** Hora prevista pra ficar pronto (mesma conta do recibo: +40 min entrega, +30 retirada). */
  dueAt: Date;
  kind: "entrega" | "retirada" | "outro";
  items: KitchenItem[];
  /** "Hashi", "Garfo" ou "Sem talher"; null quando não se sabe (pedido antigo). */
  cutlery: string | null;
  adapter: boolean;
  /** Observação do cliente/atendente já sem os trechos técnicos (pedido manual, talher, adaptador). */
  obs: string;
  /** Nome do cliente; vazio quando é "Balcão"/"Cliente" ou sem nome. */
  customerName: string;
  /** Telefone do cliente; vazio quando não tem. */
  phone: string;
  /** Endereço de entrega (só nos pedidos de entrega). */
  address: string;
  /** "Pix", "Crédito", "Débito" ou "Dinheiro"; vazio em pedido antigo sem forma de pagamento. */
  payment: string;
  readyAt: Date | null;
  isNew: boolean;
  minutesAgo: number;
};

const CUTLERY_LABEL: Record<string, string> = { hashi: "Hashi", garfo: "Garfo", nenhum: "Sem talher" };
const PAYMENT_LABEL: Record<string, string> = { pix: "Pix", cartao: "Crédito", debito: "Débito", dinheiro: "Dinheiro" };
const GENERIC_NAMES = new Set(["balcao", "balcão", "cliente", "-", ""]);
const clean = (value: string | undefined) => (value ?? "").trim().replace(/\s+/g, " ");

function ticketItems(order: OrderRecord): KitchenItem[] {
  const items: KitchenItem[] = [];
  const byParent = new Map<string, KitchenItem>();
  order.items.forEach((item) => {
    if (!item.parentId) {
      const entry: KitchenItem = { qty: item.quantity, name: item.name, addons: [] };
      items.push(entry);
      byParent.set(item.id, entry);
    }
  });
  order.items.forEach((item) => {
    if (!item.parentId) return;
    const parent = byParent.get(item.parentId);
    // Adicional sem o prato "pai" no pedido (caso raro): vira uma linha própria, pra nunca sumir da tela.
    if (parent) parent.addons.push({ qty: item.quantity, name: item.name });
    else items.push({ qty: item.quantity, name: item.name, addons: [] });
  });
  return items;
}

function toTicket(order: OrderRecord, nowMs: number): KitchenTicket {
  const notes = parseOrderNotes(order.notes ?? "");
  const kind = order.deliveryType === "entrega" ? "entrega" : order.deliveryType === "retirada" ? "retirada" : "outro";
  const arrivedMs = order.createdAt.getTime();
  const cutlery = order.cutlery ? CUTLERY_LABEL[order.cutlery] ?? null : notes.cutlery;
  const name = clean(order.customerName);
  const phone = clean(order.customerPhone);
  const readyAt = order.kitchenReadyAt ?? null;
  const minutesAgo = Math.max(0, Math.floor((nowMs - arrivedMs) / 60000));
  return {
    id: order.id,
    number: order.orderNumber,
    arrivedAt: order.createdAt,
    dueAt: new Date(arrivedMs + (kind === "outro" ? ESTIMATED_MINUTES.retirada : ESTIMATED_MINUTES[kind]) * 60000),
    kind,
    items: ticketItems(order),
    cutlery,
    adapter: notes.adapter,
    obs: notes.obs,
    customerName: GENERIC_NAMES.has(name.toLowerCase()) ? "" : name,
    phone: phone === "-" ? "" : phone,
    address: kind === "entrega" ? clean(order.location) : "",
    payment: PAYMENT_LABEL[order.paymentMethod] ?? "",
    readyAt,
    isNew: readyAt === null && minutesAgo <= NEW_ARRIVAL_MINUTES,
    minutesAgo,
  };
}

/**
 * Separa os pedidos de HOJE (dia de funcionamento) em três grupos:
 *  - arriving: chegaram há poucos minutos e ainda não estão prontos (o mais novo primeiro)
 *  - pending: mais antigos, ainda por preparar (o mais velho primeiro — quem chegou antes sai antes)
 *  - ready: já marcados como prontos (o mais recente primeiro)
 */
export function buildTickets(orders: OrderRecord[], nowMs: number): { arriving: KitchenTicket[]; pending: KitchenTicket[]; ready: KitchenTicket[] } {
  const dayStart = kitchenDayStart(nowMs);
  const tickets = orders.filter((order) => order.createdAt.getTime() >= dayStart).map((order) => toTicket(order, nowMs));
  return {
    arriving: tickets.filter((t) => t.readyAt === null && t.isNew).sort((a, b) => b.arrivedAt.getTime() - a.arrivedAt.getTime()),
    pending: tickets.filter((t) => t.readyAt === null && !t.isNew).sort((a, b) => a.arrivedAt.getTime() - b.arrivedAt.getTime()),
    ready: tickets.filter((t) => t.readyAt !== null).sort((a, b) => b.readyAt!.getTime() - a.readyAt!.getTime()),
  };
}

/** "O que preparar": soma dos pratos de todos os pedidos ainda não prontos (mais quantidade primeiro). Adicionais ficam nos pedidos. */
export function productionSummary(tickets: KitchenTicket[]): { qty: number; name: string }[] {
  const totals = new Map<string, number>();
  tickets.forEach((ticket) => ticket.items.forEach((item) => totals.set(item.name, (totals.get(item.name) ?? 0) + item.qty)));
  return [...totals.entries()].map(([name, qty]) => ({ qty, name })).sort((a, b) => b.qty - a.qty || a.name.localeCompare(b.name, "pt-BR"));
}

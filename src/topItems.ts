// "Mais pedidos" do site: regra pura (sem tela e sem Firebase, pra dar pra testar sozinha).
//
// Como funciona: o painel (sempre aberto na loja) conta o que mais saiu nos últimos 30 dias e guarda SÓ a lista de ids dos itens
// (nenhum dado de cliente) num campo público; o site lê essa lista e mostra os itens que ainda estão à venda.

import { baseItemId } from "./itemIds";

export const TOP_WINDOW_DAYS = 30;
/** Quantos ids o painel guarda (sobra de reserva: o site descarta o que estiver esgotado/excluído). */
export const TOP_STORE_COUNT = 8;
/** Quantos itens o site mostra no máximo. */
export const TOP_SHOW_COUNT = 5;
/** Menos que isso de itens disponíveis, o site não mostra a faixa (lista curta demais não ajuda). */
export const TOP_MIN_SHOWN = 3;
/** Com poucos pedidos no período o "mais pedido" não quer dizer nada: o painel guarda lista vazia e o site esconde a faixa. */
export const TOP_MIN_ORDERS = 10;

const DAY_MS = 24 * 60 * 60 * 1000;
const ID_FORMAT = /^[A-Za-z0-9_-]{1,64}$/;

type RankableOrder = { createdAt: Date; items: { id: string; quantity: number }[] };

/** Ids dos itens mais pedidos (do mais pro menos), somando a quantidade nos últimos 30 dias. Acompanhamentos não contam. */
export function rankTopItemIds(orders: RankableOrder[], options: { now: Date; excludeIds?: ReadonlySet<string> }): string[] {
  const since = options.now.getTime() - TOP_WINDOW_DAYS * DAY_MS;
  const inWindow = orders.filter((order) => order.createdAt.getTime() >= since);
  if (inWindow.length < TOP_MIN_ORDERS) return [];
  const totals = new Map<string, number>();
  for (const order of inWindow) {
    for (const line of order.items ?? []) {
      const { id, isAddon } = baseItemId(String(line.id ?? ""));
      if (isAddon || !ID_FORMAT.test(id) || options.excludeIds?.has(id)) continue;
      const quantity = Number(line.quantity);
      if (!Number.isFinite(quantity) || quantity <= 0) continue;
      totals.set(id, (totals.get(id) ?? 0) + quantity);
    }
  }
  return [...totals.entries()]
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)) // empate: sempre a mesma ordem, pra lista não ficar trocando à toa
    .slice(0, TOP_STORE_COUNT)
    .map(([id]) => id);
}

/** Lê o texto guardado; qualquer coisa fora do formato vira lista vazia (o site simplesmente não mostra a faixa). */
export function parseTopItems(raw: unknown): string[] {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > 2000) return [];
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { return []; }
  const ids = parsed && typeof parsed === "object" ? (parsed as { ids?: unknown }).ids : undefined;
  if (!Array.isArray(ids)) return [];
  const seen = new Set<string>();
  for (const id of ids) {
    if (typeof id === "string" && ID_FORMAT.test(id) && !seen.has(id)) seen.add(id);
    if (seen.size >= TOP_STORE_COUNT + 2) break;
  }
  return [...seen];
}

export const serializeTopItems = (ids: string[]): string => JSON.stringify({ v: 1, ids });

export const sameIds = (a: readonly string[], b: readonly string[]): boolean => a.length === b.length && a.every((id, index) => id === b[index]);

/** Os que o site mostra: os primeiros da lista que ainda estão à venda (até 5); com menos de 3, nenhum. */
export function pickVisibleTop(ids: readonly string[], isAvailable: (id: string) => boolean, max = TOP_SHOW_COUNT): string[] {
  const visible = ids.filter(isAvailable).slice(0, max);
  return visible.length >= TOP_MIN_SHOWN ? visible : [];
}

/** Junta duas listas de pedidos sem repetir: se o mesmo pedido estiver nas duas, vale o da lista `newer` (a ao vivo). */
export function mergeOrdersById<T extends { id: string }>(older: readonly T[], newer: readonly T[]): T[] {
  const byId = new Map<string, T>();
  older.forEach((order) => byId.set(order.id, order));
  newer.forEach((order) => byId.set(order.id, order));
  return [...byId.values()];
}

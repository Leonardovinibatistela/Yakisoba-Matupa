// Medição do caminho do cliente no site (Google Analytics, que o site já carrega): "viu o cardápio" → "colocou item" → "abriu o
// carrinho" → "começou a preencher" → "enviou o pedido". Serve pra ver ONDE as pessoas desistem em vez de adivinhar.
//
// Regras:
// - NUNCA manda dado pessoal (nome, telefone, endereço, observações): só ids/nomes de itens do cardápio, valores e escolhas (entrega/pix...).
// - Só manda de verdade no site de verdade (soobayakisoba.com.br). Prévia local, testes e o painel não sujam os números.
// - Medir nunca pode atrapalhar o pedido: qualquer erro aqui é engolido.
// - Pra conferir o que SERIA enviado sem mandar nada: no navegador, `localStorage.setItem("sooba_ga_trace", "1")` e recarregar; os eventos
//   ficam em `window.__ga_events`.

import { baseItemId } from "./itemIds";

export type GaItem = { item_id: string; item_name?: string; price?: number; quantity?: number };
export type GaParamValue = string | number | boolean | undefined | null | GaItem[];
export type GaParams = Record<string, GaParamValue>;

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
    __ga_events?: { name: string; params: Record<string, unknown> }[];
  }
}

const PRODUCTION_HOSTS = ["soobayakisoba.com.br", "www.soobayakisoba.com.br"];
const MAX_TEXT = 100;
const MAX_PARAMS = 25;
const MAX_ITEMS = 20;
// Defesa extra: mesmo que alguém passe por engano, esses campos nunca saem.
const FORBIDDEN_KEYS = new Set(["customer_name", "customer_phone", "name", "phone", "telefone", "nome", "address", "endereco", "location", "house_number", "neighborhood", "bairro", "notes", "observacoes", "email", "cpf"]);

export const isProductionHost = (hostname: string): boolean => PRODUCTION_HOSTS.includes(hostname.toLowerCase());

const cleanText = (value: string): string => value.replace(/\s+/g, " ").trim().slice(0, MAX_TEXT);
const cleanNumber = (value: number): number | undefined => (Number.isFinite(value) ? Math.round(value * 100) / 100 : undefined);

function cleanItems(items: GaItem[]): GaItem[] {
  return items.slice(0, MAX_ITEMS).flatMap((item) => {
    const id = typeof item.item_id === "string" ? cleanText(item.item_id) : "";
    if (!id) return [];
    const out: GaItem = { item_id: id };
    if (typeof item.item_name === "string" && cleanText(item.item_name)) out.item_name = cleanText(item.item_name);
    const price = typeof item.price === "number" ? cleanNumber(item.price) : undefined;
    if (price !== undefined) out.price = price;
    const quantity = typeof item.quantity === "number" ? cleanNumber(item.quantity) : undefined;
    if (quantity !== undefined) out.quantity = quantity;
    return [out];
  });
}

/** Deixa só o que o Google aceita: sem vazio, sem dado pessoal, textos curtos, no máximo 25 campos. */
export function cleanParams(params: GaParams): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(params)) {
    if (Object.keys(out).length >= MAX_PARAMS) break;
    if (value === undefined || value === null || FORBIDDEN_KEYS.has(key.toLowerCase())) continue;
    if (typeof value === "string") { const text = cleanText(value); if (text) out[key] = text; }
    else if (typeof value === "number") { const number = cleanNumber(value); if (number !== undefined) out[key] = number; }
    else if (typeof value === "boolean") out[key] = value ? "sim" : "nao";
    else if (Array.isArray(value)) { const items = cleanItems(value); if (items.length) out[key] = items; }
  }
  return out;
}

export { baseItemId };

export function buildAddToCart(lineId: string, quantityAdded: number, info: { name?: string; price?: number } | null): GaParams {
  const { id, isAddon } = baseItemId(lineId);
  const price = info?.price;
  return {
    currency: "BRL",
    value: typeof price === "number" ? price * quantityAdded : undefined,
    is_addon: isAddon,
    items: [{ item_id: id, item_name: info?.name, price, quantity: quantityAdded }],
  };
}

const traceOn = (): boolean => {
  try { return window.localStorage.getItem("sooba_ga_trace") === "1"; } catch { return false; }
};

export function track(name: string, params: GaParams = {}): void {
  try {
    if (typeof window === "undefined") return;
    const clean = cleanParams(params);
    if (traceOn()) (window.__ga_events ??= []).push({ name, params: clean });
    if (!isProductionHost(window.location.hostname) || typeof window.gtag !== "function") return;
    window.gtag("event", name, clean);
  } catch {
    // medir nunca pode atrapalhar o pedido
  }
}

const onceKeys = new Set<string>();
/** Manda o evento só na primeira vez em que a página dispara essa chave (ex.: "viu o cardápio"). */
export function trackOnce(key: string, name: string, params: GaParams = {}): void {
  if (onceKeys.has(key)) return;
  onceKeys.add(key);
  track(name, params);
}

/** Milissegundos desde que a página abriu: mede quanto o cliente demora pra chegar no cardápio / no primeiro item. */
export const msSinceLoad = (): number | undefined => {
  try { return Math.round(performance.now()); } catch { return undefined; }
};

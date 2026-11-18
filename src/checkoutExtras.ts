// Adicionais que o cliente escolhe na hora de fechar o pedido (cobrados à parte): hashi, shoyu, tarê... Ficam no carrinho, não no cardápio.
// A equipe edita a lista pelo painel (Cardápio > "Adicionais do fechamento do pedido"): nome, preço, ocultar, remover e criar novos.
// SEM FOTO, de propósito: o adicional é só nome e preço (não existe campo de foto em lugar nenhum).
//
// Entram no pedido como itens comuns (id "extra-..."), mas não são prato: não entram em "mais vendidos"/"mais pedidos", não pedem ficha
// técnica no estoque (e não deixam o custo do pedido como "parcial") e no recibo saem como linha pequena, igual acompanhamento.
import type { MenuItem } from "./menuData";

export type CheckoutExtra = { id: string; name: string; price: number; hidden?: boolean };

/** A lista que o site usa enquanto a equipe nunca salvou uma própria (e quando o botão "Voltar à lista padrão" é usado). */
export const DEFAULT_CHECKOUT_EXTRAS: CheckoutExtra[] = [
  { id: "extra-hashi", name: "Hashi", price: 1 },
  { id: "extra-shoyu-light", name: "Shoyu light (sachê)", price: 0.5 },
  { id: "extra-tare", name: "Tarê", price: 3 },
  { id: "extra-gengibre", name: "Gengibre", price: 2 },
  { id: "extra-wassabi", name: "Wassabi", price: 2 },
  { id: "extra-adaptador-hashi", name: "Adaptador de hashi", price: 0.5 },
];

export const CHECKOUT_EXTRA_PREFIX = "extra-";
export const isCheckoutExtraId = (id: string): boolean => id.startsWith(CHECKOUT_EXTRA_PREFIX);

export const MAX_CHECKOUT_EXTRAS = 20;
export const MAX_EXTRA_NAME = 40;
export const MAX_EXTRA_PRICE = 100;
const ID_FORMAT = /^extra-[a-z0-9-]{1,48}$/;

export const normalizeExtraName = (name: string): string => name.trim().replace(/\s+/g, " ");
const roundPrice = (price: number): number => Math.round(price * 100) / 100;

/** Confere nome e preço de um adicional. Devolve a mensagem em português, ou null quando está tudo certo. */
export function checkExtraFields(name: string, price: number): string | null {
  const clean = normalizeExtraName(name);
  if (!clean) return "Escreva o nome do adicional.";
  if (clean.length > MAX_EXTRA_NAME) return `O nome pode ter até ${MAX_EXTRA_NAME} letras.`;
  if (!Number.isFinite(price) || price <= 0) return "Coloque um preço maior que zero (ex.: 2,50).";
  if (price > MAX_EXTRA_PRICE) return `O preço máximo é R$ ${MAX_EXTRA_PRICE}.`;
  return null;
}

/** Id novo pra um adicional criado pela equipe: "extra-" + nome sem acento + 4 letras/números ao acaso (nunca repete um id já usado). */
export function newExtraId(name: string, taken: ReadonlySet<string>, random: () => number = Math.random): string {
  const slug = name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 24).replace(/-+$/g, "") || "novo";
  for (let attempt = 0; attempt < 30; attempt++) {
    const id = `${CHECKOUT_EXTRA_PREFIX}${slug}-${Math.floor(random() * 36 ** 4).toString(36).padStart(4, "0")}`;
    if (!taken.has(id)) return id;
  }
  return `${CHECKOUT_EXTRA_PREFIX}${slug}-${Date.now().toString(36)}`;
}

/** O texto que fica guardado no Firebase (campo checkoutExtrasJson do documento público menuStatus/hiddenItems). Só nome e preço: nada de cliente. */
export const serializeCheckoutExtras = (extras: readonly CheckoutExtra[]): string =>
  JSON.stringify({ v: 1, items: extras.map((extra) => ({ id: extra.id, name: extra.name, price: extra.price, ...(extra.hidden ? { hidden: true } : {}) })) });

/**
 * Lê o texto guardado. null = não há lista salva (ou o texto está fora do formato): quem chama usa a lista padrão.
 * Uma lista salva VAZIA é válida (a equipe removeu todos); itens estragados são ignorados, e se todos estiverem estragados vale a lista padrão.
 */
export function parseCheckoutExtras(raw: unknown): CheckoutExtra[] | null {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > 8000) return null;
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { return null; }
  const items = parsed && typeof parsed === "object" ? (parsed as { items?: unknown }).items : undefined;
  if (!Array.isArray(items)) return null;
  const seen = new Set<string>();
  const out: CheckoutExtra[] = [];
  for (const entry of items) {
    if (!entry || typeof entry !== "object") continue;
    const { id, name, price, hidden } = entry as Record<string, unknown>;
    if (typeof id !== "string" || !ID_FORMAT.test(id) || seen.has(id)) continue;
    if (typeof name !== "string" || typeof price !== "number" || checkExtraFields(name, price) !== null) continue;
    seen.add(id);
    out.push({ id, name: normalizeExtraName(name), price: roundPrice(price), ...(hidden === true ? { hidden: true } : {}) });
    if (out.length >= MAX_CHECKOUT_EXTRAS) break;
  }
  return items.length > 0 && out.length === 0 ? null : out;
}

const priceLabel = (price: number) => `R$${price.toFixed(2).replace(".", ",")}`;

/** O adicional como item do cardápio (pro carrinho tratar igual aos outros), ou null se o id não existir na lista ou estiver oculto. */
export function checkoutExtraItem(id: string, extras: readonly CheckoutExtra[]): MenuItem | null {
  const extra = extras.find((candidate) => candidate.id === id && !candidate.hidden);
  return extra ? { id: extra.id, name: extra.name, price: extra.price, priceLabel: priceLabel(extra.price) } : null;
}

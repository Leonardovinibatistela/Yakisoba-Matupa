// Adicionais que o cliente escolhe na hora de fechar o pedido: hashi, shoyu, tarê... Ficam no carrinho, não no cardápio.
// Regra da loja: o PRIMEIRO de cada adicional é grátis; do segundo em diante paga o valor (quantidade grátis editável por adicional).
// A equipe edita a lista pelo painel (Cardápio > "Adicionais do fechamento do pedido"): nome, preço, quantos são grátis, ocultar, remover e criar novos.
// SEM FOTO, de propósito: o adicional é só nome e preço (não existe campo de foto em lugar nenhum).
//
// Entram no pedido como itens comuns (id "extra-..."), mas não são prato: não entram em "mais vendidos"/"mais pedidos", não pedem ficha
// técnica no estoque (e não deixam o custo do pedido como "parcial") e no recibo saem como linha pequena, igual acompanhamento.
import type { MenuItem } from "./menuData";

export type CheckoutExtra = { id: string; name: string; price: number; /** Quantos são grátis (os primeiros). 0 = todos pagos. */ freeQuantity?: number; hidden?: boolean };

/** A lista que o site usa enquanto a equipe nunca salvou uma própria (e quando o botão "Voltar à lista padrão" é usado). O 1º de cada um é grátis. */
export const DEFAULT_CHECKOUT_EXTRAS: CheckoutExtra[] = [
  { id: "extra-hashi", name: "Hashi", price: 1, freeQuantity: 1 },
  { id: "extra-shoyu-light", name: "Shoyu light (sachê)", price: 0.5, freeQuantity: 1 },
  { id: "extra-tare", name: "Tarê", price: 3, freeQuantity: 1 },
  { id: "extra-gengibre", name: "Gengibre", price: 2, freeQuantity: 1 },
  { id: "extra-adaptador-hashi", name: "Adaptador de hashi", price: 0.5, freeQuantity: 1 },
];

export const CHECKOUT_EXTRA_PREFIX = "extra-";
export const isCheckoutExtraId = (id: string): boolean => id.startsWith(CHECKOUT_EXTRA_PREFIX);

export const MAX_CHECKOUT_EXTRAS = 20;
export const MAX_EXTRA_NAME = 40;
export const MAX_EXTRA_PRICE = 100;
export const MAX_EXTRA_FREE = 10;
const ID_FORMAT = /^extra-[a-z0-9-]{1,48}$/;

export const normalizeExtraName = (name: string): string => name.trim().replace(/\s+/g, " ");
const roundPrice = (price: number): number => Math.round(price * 100) / 100;
const money = (value: number): string => `R$ ${value.toFixed(2).replace(".", ",")}`;

/** Confere nome, preço e quantidade grátis de um adicional. Devolve a mensagem em português, ou null quando está tudo certo. */
export function checkExtraFields(name: string, price: number, freeQuantity = 0): string | null {
  const clean = normalizeExtraName(name);
  if (!clean) return "Escreva o nome do adicional.";
  if (clean.length > MAX_EXTRA_NAME) return `O nome pode ter até ${MAX_EXTRA_NAME} letras.`;
  if (!Number.isFinite(price) || roundPrice(price) <= 0) return "Coloque um preço maior que zero (ex.: 2,50).";
  if (price > MAX_EXTRA_PRICE) return `O preço máximo é R$ ${MAX_EXTRA_PRICE}.`;
  if (!Number.isInteger(freeQuantity) || freeQuantity < 0 || freeQuantity > MAX_EXTRA_FREE) return `"Grátis" tem que ser um número inteiro de 0 a ${MAX_EXTRA_FREE} (0 = nenhum grátis).`;
  return null;
}

/** Quanto o cliente paga por `quantity` unidades: os `freeQuantity` primeiros são grátis, o resto paga `price` cada. */
export const extraLineTotal = (price: number, freeQuantity: number, quantity: number): number => roundPrice(price * Math.max(0, quantity - Math.max(0, freeQuantity)));

/** A regra em palavras, pra mostrar pro cliente: "O 1º é grátis, depois R$ 1,00 cada". */
export function describeExtraRule(extra: Pick<CheckoutExtra, "price" | "freeQuantity">): string {
  const free = extra.freeQuantity ?? 0;
  if (free <= 0) return `${money(extra.price)} cada`;
  return `${free === 1 ? "O 1º é grátis" : `Os ${free} primeiros são grátis`}, depois ${money(extra.price)} cada`;
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

/** O texto que fica guardado no Firebase (campo checkoutExtrasJson do documento público menuStatus/hiddenItems). Só nome, preço e quantos são grátis: nada de cliente. */
export const serializeCheckoutExtras = (extras: readonly CheckoutExtra[]): string =>
  JSON.stringify({ v: 1, items: extras.map((extra) => ({ id: extra.id, name: extra.name, price: extra.price, freeQuantity: extra.freeQuantity ?? 0, ...(extra.hidden ? { hidden: true } : {}) })) });

/**
 * Lê o texto guardado. null = não há lista salva (ou o texto está fora do formato): quem chama usa a lista padrão.
 * Uma lista salva VAZIA é válida (a equipe removeu todos); itens estragados são ignorados, e se todos estiverem estragados vale a lista padrão.
 * "freeQuantity" que falta ou está estragado vale 0 (nenhum grátis).
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
    const { id, name, price, freeQuantity, hidden } = entry as Record<string, unknown>;
    if (typeof id !== "string" || !ID_FORMAT.test(id) || seen.has(id)) continue;
    if (typeof name !== "string" || typeof price !== "number" || checkExtraFields(name, price) !== null) continue;
    seen.add(id);
    const free = typeof freeQuantity === "number" && Number.isInteger(freeQuantity) && freeQuantity >= 0 && freeQuantity <= MAX_EXTRA_FREE ? freeQuantity : 0;
    out.push({ id, name: normalizeExtraName(name), price: roundPrice(price), freeQuantity: free, ...(hidden === true ? { hidden: true } : {}) });
    if (out.length >= MAX_CHECKOUT_EXTRAS) break;
  }
  return items.length > 0 && out.length === 0 ? null : out;
}

const priceLabel = (price: number) => `R$${price.toFixed(2).replace(".", ",")}`;

/** O adicional como item do cardápio (pro carrinho tratar igual aos outros) + quantos são grátis, ou null se o id não existir na lista ou estiver oculto. */
export function checkoutExtraItem(id: string, extras: readonly CheckoutExtra[]): (MenuItem & { freeQuantity: number }) | null {
  const extra = extras.find((candidate) => candidate.id === id && !candidate.hidden);
  return extra ? { id: extra.id, name: extra.name, price: extra.price, priceLabel: priceLabel(extra.price), freeQuantity: extra.freeQuantity ?? 0 } : null;
}

/**
 * Chave de liberação dos adicionais do fechamento.
 * false (agora): só quem abre o site com ?adicionais=1 enxerga o bloco, e o editor do painel aparece só pro desenvolvedor.
 * true: todo mundo (clientes no site e a equipe no painel).
 */
export const CHECKOUT_EXTRAS_FOR_EVERYONE = false;
export const EXTRAS_TEST_STORAGE_KEY = "sooba-adicionais-teste";

type TinyStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/**
 * O visitante vê os adicionais? Com a chave desligada: ?adicionais=1 liga (e lembra neste aparelho), ?adicionais=0 desliga.
 * Nunca quebra se o navegador bloquear o armazenamento (aí vale só o que veio no endereço).
 */
export function checkoutExtrasEnabledForVisitor(search: string, storage: TinyStorage | null, everyone: boolean = CHECKOUT_EXTRAS_FOR_EVERYONE): boolean {
  if (everyone) return true;
  let flag: string | null = null;
  try { flag = new URLSearchParams(search).get("adicionais"); } catch { flag = null; }
  try {
    if (flag === "1") { storage?.setItem(EXTRAS_TEST_STORAGE_KEY, "1"); return true; }
    if (flag === "0") { storage?.removeItem(EXTRAS_TEST_STORAGE_KEY); return false; }
    return storage?.getItem(EXTRAS_TEST_STORAGE_KEY) === "1";
  } catch {
    return flag === "1";
  }
}

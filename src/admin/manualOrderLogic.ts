// Só regra — nada de Firebase nem de tela aqui, pra dar pra testar sozinho.
// Monta o pedido digitado pela equipe no painel (telefone, balcão, WhatsApp)
// no MESMO formato que o site público grava, pra o resto do sistema (som,
// impressão, estoque, Financeiro) tratar igual a um pedido vindo do site.
import type { MenuItem, MenuSection } from "../menuData";
import type { OrderLineItem, OrderPayload } from "../orders";

// Mesmos separadores do carrinho do site (App.tsx): "<prato>#<seq>" é uma unidade
// de yakisoba e "<unidade>::<adicional>" é um adicional dela. recipeIds.ts depende disso.
export const ADDON_SEPARATOR = "::";
export const INSTANCE_SEPARATOR = "#";
/** Só yakisoba médio/grande aceita adicional (igual ao site). */
export const YAKI_SECTION_IDS = ["yaki-medio", "yaki-grande"];

// Limites das regras do Firestore para criar pedido (firestore.rules) — validar aqui evita o "permissão negada" no meio do balcão.
export const MAX_ORDER_LINES = 30;
export const MAX_ORDER_TOTAL = 5000;
export const MAX_DELIVERY_FEE = 100;
export const MAX_NOTES_LENGTH = 500;
export const MAX_LOCATION_LENGTH = 300;
export const MAX_NAME_LENGTH = 100;
export const MAX_PHONE_LENGTH = 30;

export type ManualSource = "telefone" | "whatsapp" | "balcao";
export const MANUAL_SOURCES: { id: ManualSource; label: string }[] = [
  { id: "telefone", label: "Telefone" },
  { id: "whatsapp", label: "WhatsApp" },
  { id: "balcao", label: "Balcão" },
];

export type Cutlery = "hashi" | "garfo" | "nenhum";
export type PaymentMethod = "pix" | "cartao" | "dinheiro";

export const round2 = (value: number): number => Math.round(value * 100) / 100;

/** Item que aparece pra escolher na aba (já com nome/preço do painel aplicados). */
export type CatalogItem = { id: string; name: string; description?: string; price: number; soldOut: boolean };
export type CatalogSection = { id: string; title: string; items: CatalogItem[]; allowsAddons: boolean };

export type CatalogInput = {
  menuSections: MenuSection[];
  addonSections: MenuSection[];
  /** Itens que o admin criou pelo painel (cada um diz em qual seção do cardápio entra). */
  customItems: (MenuItem & { sectionId: string })[];
  /** Combos do dia; só os que valem no dia da semana de `today` aparecem. */
  dailyCombos: (MenuItem & { days: number[] })[];
  soldOutIds: Set<string>;
  hiddenIds: Set<string>;
  priceOverrides: Record<string, number>;
  nameOverrides: Record<string, string>;
  today: Date;
};

const toCatalogItem = (item: MenuItem, input: CatalogInput): CatalogItem => ({
  id: item.id,
  name: input.nameOverrides[item.id] ?? item.name,
  description: item.description,
  price: input.priceOverrides[item.id] ?? item.price,
  soldOut: input.soldOutIds.has(item.id),
});

/** Seções do cardápio pra escolher: combos de hoje primeiro, depois o cardápio (sem os itens ocultos). */
export function buildCatalog(input: CatalogInput): { sections: CatalogSection[]; addons: CatalogSection[] } {
  const day = input.today.getDay();
  const sections: CatalogSection[] = [];
  const todaysCombos = input.dailyCombos.filter((combo) => combo.days.includes(day) && !input.hiddenIds.has(combo.id));
  if (todaysCombos.length > 0) sections.push({ id: "promo-do-dia", title: "Promoção do dia", items: todaysCombos.map((combo) => toCatalogItem(combo, input)), allowsAddons: false });
  input.menuSections.forEach((section) => {
    const items = [...section.items, ...input.customItems.filter((item) => item.sectionId === section.id)].filter((item) => !input.hiddenIds.has(item.id));
    if (items.length > 0) sections.push({ id: section.id, title: section.eyebrow, items: items.map((item) => toCatalogItem(item, input)), allowsAddons: YAKI_SECTION_IDS.includes(section.id) });
  });
  const addons = input.addonSections.map((section) => ({ id: section.id, title: section.eyebrow, items: section.items.filter((item) => !input.hiddenIds.has(item.id)).map((item) => toCatalogItem(item, input)), allowsAddons: false }));
  return { sections, addons };
}

/** "medio-frango#k3a1" -> "medio-frango"; "medio-frango#k3a1::brocolis" -> "medio-frango". */
export const baseItemId = (cartId: string): string => {
  const withoutAddon = cartId.includes(ADDON_SEPARATOR) ? cartId.slice(0, cartId.indexOf(ADDON_SEPARATOR)) : cartId;
  const instanceIndex = withoutAddon.indexOf(INSTANCE_SEPARATOR);
  return instanceIndex === -1 ? withoutAddon : withoutAddon.slice(0, instanceIndex);
};
export const addonCartId = (parentCartId: string, addonId: string): string => `${parentCartId}${ADDON_SEPARATOR}${addonId}`;
export const isAddonCartId = (cartId: string): boolean => cartId.includes(ADDON_SEPARATOR);

export type ManualLine = { id: string; name: string; price: number; quantity: number; parentId?: string };

/**
 * Transforma as quantidades do carrinho ({ id: quantidade }) nas linhas do pedido, cada unidade seguida dos
 * seus adicionais. Ids que não existem mais no cardápio (ou com quantidade 0) são ignorados.
 */
export function buildLines(quantities: Record<string, number>, lookup: Map<string, { name: string; price: number }>): ManualLine[] {
  const ids = Object.keys(quantities).filter((id) => (quantities[id] ?? 0) > 0);
  const lines: ManualLine[] = [];
  ids.filter((id) => !isAddonCartId(id)).forEach((id) => {
    const found = lookup.get(baseItemId(id));
    if (!found) return;
    lines.push({ id, name: found.name, price: found.price, quantity: quantities[id] });
    ids.filter((other) => other.startsWith(id + ADDON_SEPARATOR)).forEach((addonId) => {
      const addon = lookup.get(addonId.slice(addonId.indexOf(ADDON_SEPARATOR) + ADDON_SEPARATOR.length));
      if (addon) lines.push({ id: addonId, name: addon.name, price: addon.price, quantity: quantities[addonId], parentId: id });
    });
  });
  return lines;
}

export const linesSubtotal = (lines: ManualLine[]): number => round2(lines.reduce((sum, line) => sum + line.price * line.quantity, 0));

export type ManualOrderForm = {
  source: ManualSource;
  customerName: string;
  customerPhone: string;
  deliveryType: "retirada" | "entrega";
  street: string;
  houseNumber: string;
  neighborhood: string;
  /** Taxa de entrega já em número (0 na retirada). */
  deliveryFee: number;
  paymentMethod: PaymentMethod;
  cutlery: Cutlery;
  chopstickAdapter: boolean;
  notes: string;
};

const TALHER_LABEL: Record<Cutlery, string> = { hashi: "Hashi", garfo: "Garfo", nenhum: "" };
const SOURCE_LABEL: Record<ManualSource, string> = { telefone: "telefone", whatsapp: "WhatsApp", balcao: "balcão" };

/** O painel e o recibo só mostram "observações": a origem, o talher e o adaptador vão lá dentro, nessa ordem. */
export function composeNotes(form: Pick<ManualOrderForm, "source" | "cutlery" | "chopstickAdapter" | "notes">): string {
  const parts = [`PEDIDO MANUAL (${SOURCE_LABEL[form.source]})`];
  if (TALHER_LABEL[form.cutlery]) parts.push(`Talher: ${TALHER_LABEL[form.cutlery]}`);
  if (form.cutlery === "hashi" && form.chopstickAdapter) parts.push("ADAPTADOR DE HASHI: SIM");
  if (form.notes.trim()) parts.push(form.notes.trim());
  return parts.join(" | ");
}

/** Nome/telefone são obrigatórios nas regras do banco; no balcão ou sem telefone entra um texto padrão. */
const fallbackName = (source: ManualSource) => (source === "balcao" ? "Balcão" : "Cliente");

export type BuildResult = { ok: true; payload: OrderPayload } | { ok: false; error: string };

/** Confere o pedido contra as regras do banco e devolve o pacote pronto pra gravar (ou o erro em português). */
export function buildManualOrderPayload(lines: ManualLine[], form: ManualOrderForm): BuildResult {
  if (lines.length === 0) return { ok: false, error: "Escolha pelo menos um item." };
  if (lines.length > MAX_ORDER_LINES) return { ok: false, error: `O pedido tem itens demais (máximo ${MAX_ORDER_LINES} linhas, contando os adicionais).` };
  const entrega = form.deliveryType === "entrega";
  const street = form.street.trim();
  const houseNumber = form.houseNumber.trim();
  const neighborhood = form.neighborhood.trim();
  if (entrega && (!street || !houseNumber || !neighborhood)) return { ok: false, error: "Entrega precisa de rua, número (pode ser \"s/n\") e bairro." };
  const fee = entrega ? round2(form.deliveryFee) : 0;
  if (!Number.isFinite(fee) || fee < 0 || fee > MAX_DELIVERY_FEE) return { ok: false, error: `A taxa de entrega tem que ficar entre R$ 0 e R$ ${MAX_DELIVERY_FEE}.` };
  const subtotal = linesSubtotal(lines);
  const total = round2(subtotal + fee);
  if (subtotal > MAX_ORDER_TOTAL || total > MAX_ORDER_TOTAL) return { ok: false, error: `O total passou do limite de R$ ${MAX_ORDER_TOTAL}.` };
  const customerName = form.customerName.trim() || fallbackName(form.source);
  const customerPhone = form.customerPhone.trim() || "-";
  if (customerName.length > MAX_NAME_LENGTH) return { ok: false, error: `O nome passou de ${MAX_NAME_LENGTH} letras.` };
  if (customerPhone.length > MAX_PHONE_LENGTH) return { ok: false, error: `O telefone passou de ${MAX_PHONE_LENGTH} caracteres.` };
  const location = entrega ? `${street}, nº ${houseNumber} - ${neighborhood}` : "";
  if (location.length > MAX_LOCATION_LENGTH) return { ok: false, error: "O endereço ficou comprido demais." };
  const notes = composeNotes(form);
  if (notes.length > MAX_NOTES_LENGTH) return { ok: false, error: `As observações ficaram compridas demais (máximo ${MAX_NOTES_LENGTH} letras, contando o que o sistema acrescenta).` };
  const items: OrderLineItem[] = lines.map((line) => ({ id: line.id, name: line.name, quantity: line.quantity, unitPrice: line.price, lineTotal: round2(line.price * line.quantity), ...(line.parentId ? { parentId: line.parentId } : {}) }));
  return {
    ok: true,
    payload: {
      customerName,
      customerPhone,
      items,
      subtotal,
      deliveryFee: fee,
      total,
      deliveryType: form.deliveryType,
      location,
      cutlery: form.cutlery,
      paymentMethod: form.paymentMethod,
      notes,
    },
  };
}

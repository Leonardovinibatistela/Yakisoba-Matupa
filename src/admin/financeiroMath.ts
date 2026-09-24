import type { OrderRecord } from "./adminData";
import type { Ingredient } from "./ingredients";
import type { Recipes } from "./recipes";
import type { PaymentFeeRates, PaymentMethod } from "./paymentFees";
import type { OrderCostRates } from "./orderCosts";
import { resolveRecipeItemId } from "./recipeIds";

// Só contas — nada de tela nem de Firebase aqui, pra dar pra testar sozinho.

/**
 * Como o custo de um pedido foi calculado:
 * - "completo": o pedido descontou estoque e todos os pratos tinham ficha técnica com custo real;
 * - "parcial": descontou, mas algum prato estava sem ficha técnica ou com ingrediente sem custo (custo subestimado);
 * - "sem-custo": nunca descontou estoque (pedido de antes do sistema, ou falha) — o custo dele entra como R$ 0.
 */
export type CostStatus = "completo" | "parcial" | "sem-custo";

export function orderCostStatus(order: OrderRecord): CostStatus {
  if (!order.stockDeducted) return "sem-custo";
  if (order.missingRecipeItemIds.length > 0 || order.incompleteCostItemIds.length > 0) return "parcial";
  return "completo";
}

export const orderFee = (order: OrderRecord, rates: PaymentFeeRates): number => order.total * (rates[order.paymentMethod as PaymentMethod] ?? 0);

/** Embalagem vale pra todo pedido; motoboy só pra entrega. Calculado com os valores de hoje (igual a taxa de pagamento), então vale também pros pedidos antigos. */
export const orderPackaging = (costs: OrderCostRates): number => costs.packaging;
export const orderCourier = (order: OrderRecord, costs: OrderCostRates): number => (order.deliveryType === "entrega" ? costs.courier : 0);

export type PeriodSummary = {
  orders: number;
  bruto: number;
  custo: number;
  taxas: number;
  embalagem: number;
  motoboy: number;
  /** pedidos de entrega (base do custo de motoboy) */
  entregas: number;
  /** quanto do bruto é taxa de entrega cobrada dos clientes (não é venda de comida) */
  taxaEntrega: number;
  /** bruto − ingredientes − taxas de pagamento − embalagem − motoboy (ainda sem gastos fixos) */
  margem: number;
  margemPct: number | null;
  ticket: number | null;
  completos: number;
  parciais: number;
  semCusto: number;
  /** % de margem olhando só os pedidos com custo completo — é o número mais confiável pra projetar o resto. */
  margemPctCompleta: number | null;
};

export function summarizeOrders(orders: OrderRecord[], rates: PaymentFeeRates, costs: OrderCostRates): PeriodSummary {
  let bruto = 0, custo = 0, taxas = 0, embalagem = 0, motoboy = 0, entregas = 0, taxaEntrega = 0;
  let completos = 0, parciais = 0, semCusto = 0;
  let brutoCompleto = 0, margemCompleta = 0;
  orders.forEach((order) => {
    const fee = orderFee(order, rates);
    const packaging = orderPackaging(costs);
    const courier = orderCourier(order, costs);
    bruto += order.total;
    custo += order.ingredientCost;
    taxas += fee;
    embalagem += packaging;
    motoboy += courier;
    if (order.deliveryType === "entrega") entregas += 1;
    taxaEntrega += order.deliveryFee;
    const status = orderCostStatus(order);
    if (status === "completo") { completos += 1; brutoCompleto += order.total; margemCompleta += order.total - order.ingredientCost - fee - packaging - courier; }
    else if (status === "parcial") parciais += 1;
    else semCusto += 1;
  });
  const margem = bruto - custo - taxas - embalagem - motoboy;
  return {
    orders: orders.length, bruto, custo, taxas, embalagem, motoboy, entregas, taxaEntrega, margem,
    margemPct: bruto > 0 ? margem / bruto : null,
    ticket: orders.length > 0 ? bruto / orders.length : null,
    completos, parciais, semCusto,
    margemPctCompleta: brutoCompleto > 0 ? margemCompleta / brutoCompleto : null,
  };
}

export type BreakEven = {
  fixedTotal: number;
  /** margem usada na conta (fração, ex.: 0.62) e de onde ela veio */
  marginPct: number | null;
  basis: "completa" | "estimada";
  /** faturamento do mês necessário pra cobrir os gastos fixos */
  needed: number | null;
  missing: number;
  covered: boolean;
  /** 0 a 1 */
  progress: number;
  projected: number;
  daysElapsed: number;
  daysInMonth: number;
};

/** Ponto de equilíbrio do mês: quanto precisa vender pra pagar os gastos fixos, e quanto já foi. */
export function breakEven(month: PeriodSummary, fixedTotal: number, now: Date): BreakEven {
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const daysElapsed = Math.max(1, now.getDate());
  const basis: "completa" | "estimada" = month.margemPctCompleta !== null ? "completa" : "estimada";
  const marginPct = month.margemPctCompleta ?? month.margemPct;
  const needed = fixedTotal <= 0 ? 0 : marginPct !== null && marginPct > 0 ? fixedTotal / marginPct : null;
  const covered = needed !== null && month.bruto >= needed;
  return {
    fixedTotal, marginPct, basis, needed,
    missing: needed !== null ? Math.max(0, needed - month.bruto) : 0,
    covered,
    progress: needed === null ? 0 : needed === 0 ? 1 : Math.min(1, month.bruto / needed),
    projected: (month.bruto / daysElapsed) * daysInMonth,
    daysElapsed, daysInMonth,
  };
}

export type PaymentRow = { method: PaymentMethod | "outro"; orders: number; bruto: number; rate: number; fee: number };

export function paymentBreakdown(orders: OrderRecord[], rates: PaymentFeeRates): PaymentRow[] {
  const methods: (PaymentMethod | "outro")[] = ["pix", "cartao", "dinheiro", "outro"];
  return methods.map((method) => {
    const group = orders.filter((order) => (method === "outro" ? !["pix", "cartao", "dinheiro"].includes(order.paymentMethod) : order.paymentMethod === method));
    const bruto = group.reduce((sum, order) => sum + order.total, 0);
    const rate = method === "outro" ? 0 : rates[method] ?? 0;
    return { method, orders: group.length, bruto, rate, fee: bruto * rate };
  }).filter((row) => row.orders > 0 || row.method !== "outro");
}

/** Quantas unidades de cada prato/adicional/combo foram vendidas (pelo id da ficha técnica, então "medio-frango#abc" conta como "medio-frango"). */
export function soldByItem(orders: OrderRecord[]): Map<string, number> {
  const sold = new Map<string, number>();
  orders.forEach((order) => order.items.forEach((item) => {
    const id = resolveRecipeItemId(item.id);
    sold.set(id, (sold.get(id) ?? 0) + item.quantity);
  }));
  return sold;
}

export type CatalogItem = { id: string; name: string; price: number; hidden?: boolean };

export type RecipeCostResult = { cost: number; complete: boolean; missingNames: string[] };

/** Custo atual de um prato pela ficha técnica de hoje (não é o custo histórico do que já foi vendido). null = sem ficha técnica. */
export function recipeCost(itemId: string, recipes: Recipes, ingredients: Ingredient[]): RecipeCostResult | null {
  const recipe = recipes[itemId];
  if (!recipe || recipe.length === 0) return null;
  const missingNames: string[] = [];
  const cost = recipe.reduce((total, entry) => {
    const ingredient = ingredients.find((candidate) => candidate.id === entry.ingredientId);
    if (!ingredient) missingNames.push("ingrediente removido");
    else if (ingredient.avgCost <= 0) missingNames.push(ingredient.name);
    return total + entry.quantity * (ingredient?.avgCost ?? 0);
  }, 0);
  return { cost, complete: missingNames.length === 0, missingNames };
}

export type DishRow = { id: string; name: string; price: number; cost: number; margin: number; marginPct: number | null; sold: number; profit: number; complete: boolean; missingNames: string[] };
export type DishWithoutRecipe = { id: string; name: string; sold: number };

/** Separa os pratos (que ainda estão no cardápio) entre os que têm ficha técnica e os que não têm. Item excluído do site fica de fora. */
export function analyzeDishes(catalog: CatalogItem[], recipes: Recipes, ingredients: Ingredient[], sold: Map<string, number>): { withRecipe: DishRow[]; withoutRecipe: DishWithoutRecipe[] } {
  const withRecipe: DishRow[] = [];
  const withoutRecipe: DishWithoutRecipe[] = [];
  catalog.filter((item) => !item.hidden).forEach((item) => {
    const soldQuantity = sold.get(item.id) ?? 0;
    const result = recipeCost(item.id, recipes, ingredients);
    if (!result) { withoutRecipe.push({ id: item.id, name: item.name, sold: soldQuantity }); return; }
    const margin = item.price - result.cost;
    withRecipe.push({ id: item.id, name: item.name, price: item.price, cost: result.cost, margin, marginPct: item.price > 0 ? margin / item.price : null, sold: soldQuantity, profit: margin * soldQuantity, complete: result.complete, missingNames: result.missingNames });
  });
  withoutRecipe.sort((a, b) => b.sold - a.sold || a.name.localeCompare(b.name, "pt-BR"));
  return { withRecipe, withoutRecipe };
}

/** Ingredientes que entram em alguma ficha técnica mas ainda não têm nenhuma compra registrada (custo desconhecido). */
export function ingredientsWithoutCost(ingredients: Ingredient[], recipes: Recipes): Ingredient[] {
  const used = new Set<string>();
  Object.values(recipes).forEach((rows) => rows.forEach((row) => used.add(row.ingredientId)));
  return ingredients.filter((ingredient) => used.has(ingredient.id) && ingredient.avgCost <= 0);
}

/**
 * Menor preço terminado em ,90 que dá pelo menos a margem desejada (0 a 1) sobre o custo.
 * Margem = (preço − custo) ÷ preço, igual à da tabela "Lucro por prato". null se não der pra calcular.
 */
export function suggestPrice(cost: number, targetMargin: number): number | null {
  if (!(cost > 0) || !(targetMargin >= 0) || targetMargin >= 0.95) return null;
  const raw = cost / (1 - targetMargin);
  let candidate = Math.floor(raw) + 0.9;
  if (candidate < raw - 1e-9) candidate += 1;
  return Math.round(candidate * 100) / 100;
}

export type PriceSimulation = {
  price: number;
  /** quanto sobra por prato depois do custo dos ingredientes */
  sobra: number;
  marginPct: number | null;
  /** lucro do mês com este preço, SE vender a mesma quantidade */
  lucroMes: number;
  /** quanto isso muda no mês em relação ao preço de hoje (mesma quantidade vendida) */
  ganhoMes: number;
};

/** O que acontece com um prato se ele passar a custar `newPrice`. Não prevê queda de venda: só faz a conta com a quantidade do mês. */
export function simulatePrice(dish: { cost: number; price: number; sold: number }, newPrice: number): PriceSimulation {
  const sobra = newPrice - dish.cost;
  const lucroMes = sobra * dish.sold;
  return { price: newPrice, sobra, marginPct: newPrice > 0 ? sobra / newPrice : null, lucroMes, ganhoMes: lucroMes - (dish.price - dish.cost) * dish.sold };
}

import { useState } from "react";
import type { OrderRecord } from "./adminData";
import type { Ingredient } from "./ingredients";
import type { Recipes } from "./recipes";
import type { FixedExpense } from "./fixedExpenses";
import type { PaymentFeeRates } from "./paymentFees";

const formatTotal = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const PAYMENT_LABELS: Record<keyof PaymentFeeRates, string> = { pix: "Pix", cartao: "Cartão", dinheiro: "Dinheiro" };

const sumRevenue = (orders: OrderRecord[]) => orders.reduce((total, order) => total + order.total, 0);
const sumIngredientCost = (orders: OrderRecord[]) => orders.reduce((total, order) => total + order.ingredientCost, 0);
const sumPaymentFees = (orders: OrderRecord[], rates: PaymentFeeRates) => orders.reduce((total, order) => total + order.total * (rates[order.paymentMethod as keyof PaymentFeeRates] ?? 0), 0);
const countFlaggedOrders = (orders: OrderRecord[]) => orders.filter((order) => order.missingRecipeItemIds.length > 0 || order.incompleteCostItemIds.length > 0).length;
const sumFixedExpenses = (fixedExpenses: FixedExpense[]) => fixedExpenses.reduce((total, expense) => total + expense.amount, 0);

/**
 * Custo atual de um prato pela ficha técnica de hoje (não é o custo
 * histórico do que já foi vendido). `complete: false` quando algum
 * ingrediente da receita não tem custo real (nunca comprado, ou apagado) —
 * nesse caso `cost` ainda é um número, mas NUNCA deve ser mostrado como se
 * fosse confiável.
 */
function currentRecipeCost(itemId: string, recipes: Recipes, ingredients: Ingredient[]): { cost: number; complete: boolean } | null {
  const recipe = recipes[itemId];
  if (!recipe || recipe.length === 0) return null;
  let complete = true;
  const cost = recipe.reduce((total, entry) => {
    const ingredient = ingredients.find((candidate) => candidate.id === entry.ingredientId);
    if (!ingredient || ingredient.avgCost <= 0) complete = false;
    return total + entry.quantity * (ingredient?.avgCost ?? 0);
  }, 0);
  return { cost, complete };
}

function PeriodCard({ title, orders, showFixedExpenses, fixedExpensesTotal, purchasesTotal, paymentFeeRates }: { title: string; orders: OrderRecord[]; showFixedExpenses: boolean; fixedExpensesTotal: number; purchasesTotal?: number; paymentFeeRates: PaymentFeeRates }) {
  const bruto = sumRevenue(orders);
  const custoVariavel = sumIngredientCost(orders);
  const taxaPagamento = sumPaymentFees(orders, paymentFeeRates);
  const margem = bruto - custoVariavel - taxaPagamento;
  const liquido = margem - fixedExpensesTotal;
  const flaggedCount = countFlaggedOrders(orders);
  return (
    <div className="min-w-0 rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <p className="text-[10px] font-bold uppercase tracking-[.14em] text-white/45">{title}</p>
      <p className="mt-2 text-xs text-white/55">Bruto <span className="font-bold text-white">{formatTotal(bruto)}</span></p>
      <p className="mt-1 text-xs text-white/55">Custo variável (pelas vendas) <span className="font-bold text-white">{formatTotal(custoVariavel)}</span></p>
      <p className="mt-1 text-xs text-white/55">Taxa de pagamento <span className="font-bold text-white">{formatTotal(taxaPagamento)}</span></p>
      {purchasesTotal !== undefined && <p className="mt-1 text-xs text-white/40">Total comprado no período <span className="font-bold text-white/70">{formatTotal(purchasesTotal)}</span> <span className="text-[10px]">(aproximado — inclui compra que ainda não foi vendida)</span></p>}
      {showFixedExpenses && <p className="mt-1 text-xs text-white/55">Gastos fixos <span className="font-bold text-white">{formatTotal(fixedExpensesTotal)}</span></p>}
      <p className="mt-2 font-display text-xl font-extrabold text-[#ff875c]">{showFixedExpenses ? formatTotal(liquido) : formatTotal(margem)}</p>
      <p className="text-[10px] text-white/40">{showFixedExpenses ? "lucro líquido" : "margem (bruto − custo variável − taxa)"}</p>
      {flaggedCount > 0 && <p className="mt-2 text-[11px] text-amber-300/80">⚠️ {flaggedCount} pedido{flaggedCount === 1 ? "" : "s"} com prato sem ficha técnica ou com ingrediente sem custo cadastrado — custo pode estar subestimado.</p>}
    </div>
  );
}

function PaymentFeesEditor({ paymentFeeRates, onSetPaymentFeeRates }: { paymentFeeRates: PaymentFeeRates; onSetPaymentFeeRates: (rates: PaymentFeeRates) => Promise<void> }) {
  const [drafts, setDrafts] = useState<Record<string, string>>({ pix: String(paymentFeeRates.pix * 100), cartao: String(paymentFeeRates.cartao * 100), dinheiro: String(paymentFeeRates.dinheiro * 100) });
  const [saving, setSaving] = useState(false);
  const handleSave = () => {
    setSaving(true);
    const rates: PaymentFeeRates = { pix: (Number(drafts.pix.replace(",", ".")) || 0) / 100, cartao: (Number(drafts.cartao.replace(",", ".")) || 0) / 100, dinheiro: (Number(drafts.dinheiro.replace(",", ".")) || 0) / 100 };
    onSetPaymentFeeRates(rates).finally(() => setSaving(false));
  };
  return (
    <div className="rounded-2xl border border-white/10 bg-[#171211] p-6">
      <p className="text-xs font-bold uppercase tracking-[.18em] text-[#ff7c50]">Taxa de pagamento</p>
      <h3 className="mt-1 font-display text-lg font-extrabold tracking-[-.03em]">Quanto a maquininha/plataforma come de cada venda</h3>
      <p className="mt-1.5 text-sm text-white/50">Em porcentagem do valor do pedido. Deixa 0 pra forma de pagamento que não tem taxa (ex.: Pix, dinheiro).</p>
      <div className="mt-4 flex flex-wrap items-end gap-3">
        {(Object.keys(PAYMENT_LABELS) as (keyof PaymentFeeRates)[]).map((method) => (
          <div key={method}>
            <label className="text-[10px] font-bold uppercase tracking-[.14em] text-white/45">{PAYMENT_LABELS[method]} (%)</label>
            <input type="text" inputMode="decimal" value={drafts[method]} onChange={(event) => setDrafts((current) => ({ ...current, [method]: event.target.value }))} className="mt-1.5 w-24 rounded-lg border border-white/15 bg-white/[0.06] px-2.5 py-1.5 text-sm text-white outline-none focus:border-[#ff6b32]" />
          </div>
        ))}
        <button type="button" onClick={handleSave} disabled={saving} className="rounded-full bg-[#ff5a19] px-4 py-2 text-xs font-bold text-white transition hover:bg-[#ff6a2e] disabled:cursor-wait disabled:opacity-50">{saving ? "Salvando…" : "Salvar"}</button>
      </div>
    </div>
  );
}

export default function FinanceiroPanel({ todayOrders, weekOrders, monthOrders, monthPurchasesTotal, ingredients, recipes, fixedExpenses, paymentFeeRates, itemCatalog, onAddFixedExpense, onUpdateFixedExpense, onDeleteFixedExpense, onSetPaymentFeeRates }: { todayOrders: OrderRecord[]; weekOrders: OrderRecord[]; monthOrders: OrderRecord[]; monthPurchasesTotal: number; ingredients: Ingredient[]; recipes: Recipes; fixedExpenses: FixedExpense[]; paymentFeeRates: PaymentFeeRates; itemCatalog: { id: string; name: string; price: number }[]; onAddFixedExpense: (name: string, amount: number) => Promise<void>; onUpdateFixedExpense: (id: string, name: string, amount: number) => Promise<void>; onDeleteFixedExpense: (id: string) => Promise<void>; onSetPaymentFeeRates: (rates: PaymentFeeRates) => Promise<void> }) {
  const [newExpenseName, setNewExpenseName] = useState("");
  const [newExpenseAmount, setNewExpenseAmount] = useState("");
  const [addingExpense, setAddingExpense] = useState(false);
  const [editDrafts, setEditDrafts] = useState<Record<string, { name: string; amount: string }>>({});
  const [savingExpenseId, setSavingExpenseId] = useState<string | null>(null);

  const fixedExpensesTotal = sumFixedExpenses(fixedExpenses);

  const handleAddExpense = () => {
    const name = newExpenseName.trim();
    const amount = Number(newExpenseAmount.replace(",", "."));
    if (!name || !amount || amount <= 0) return;
    setAddingExpense(true);
    onAddFixedExpense(name, amount).then(() => { setNewExpenseName(""); setNewExpenseAmount(""); }).finally(() => setAddingExpense(false));
  };

  const handleSaveExpense = (expense: FixedExpense) => {
    const draft = editDrafts[expense.id] ?? { name: expense.name, amount: String(expense.amount) };
    const amount = Number(draft.amount.replace(",", "."));
    if (!draft.name.trim() || !amount || amount <= 0) return;
    setSavingExpenseId(expense.id);
    onUpdateFixedExpense(expense.id, draft.name.trim(), amount).finally(() => setSavingExpenseId(null));
  };

  const costByItem = itemCatalog.map((item) => ({ item, result: currentRecipeCost(item.id, recipes, ingredients) }));
  const ranking = costByItem
    .filter(({ result }) => result !== null && result.complete)
    .map(({ item, result }) => ({ ...item, cost: result!.cost, margin: item.price - result!.cost }))
    .sort((a, b) => b.margin - a.margin);
  const incompleteCostItems = costByItem.filter(({ result }) => result !== null && !result.complete).map(({ item }) => item);
  const itemsWithoutRecipe = costByItem.filter(({ result }) => result === null).map(({ item }) => item);

  return (
    <div className="space-y-8">
      <div>
        <p className="text-xs font-bold uppercase tracking-[.18em] text-[#ff7c50]">Financeiro</p>
        <h2 className="mt-1 font-display text-xl font-extrabold tracking-[-.03em]">Bruto, custo e lucro real</h2>
        <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <PeriodCard title="Hoje" orders={todayOrders} showFixedExpenses={false} fixedExpensesTotal={0} paymentFeeRates={paymentFeeRates} />
          <PeriodCard title="Essa semana" orders={weekOrders} showFixedExpenses={false} fixedExpensesTotal={0} paymentFeeRates={paymentFeeRates} />
          <PeriodCard title="Esse mês" orders={monthOrders} showFixedExpenses fixedExpensesTotal={fixedExpensesTotal} purchasesTotal={monthPurchasesTotal} paymentFeeRates={paymentFeeRates} />
        </div>
      </div>

      <PaymentFeesEditor paymentFeeRates={paymentFeeRates} onSetPaymentFeeRates={onSetPaymentFeeRates} />

      <div className="rounded-2xl border border-white/10 bg-[#171211] p-6">
        <p className="text-xs font-bold uppercase tracking-[.18em] text-[#ff7c50]">Despesas fixas</p>
        <h3 className="mt-1 font-display text-lg font-extrabold tracking-[-.03em]">Aluguel, luz, funcionário...</h3>
        <div className="mt-4 divide-y divide-white/10 rounded-xl border border-white/10">
          {fixedExpenses.length === 0 ? (
            <p className="p-4 text-sm text-white/50">Nenhuma despesa fixa cadastrada ainda.</p>
          ) : fixedExpenses.map((expense) => {
            const draft = editDrafts[expense.id] ?? { name: expense.name, amount: String(expense.amount) };
            return (
              <div key={expense.id} className="flex flex-wrap items-center gap-2 p-3">
                <input type="text" value={draft.name} onChange={(event) => setEditDrafts((current) => ({ ...current, [expense.id]: { ...draft, name: event.target.value } }))} className="min-w-0 flex-1 rounded-lg border border-white/15 bg-white/[0.06] px-2.5 py-1.5 text-sm text-white outline-none focus:border-[#ff6b32]" />
                <input type="text" inputMode="decimal" value={draft.amount} onChange={(event) => setEditDrafts((current) => ({ ...current, [expense.id]: { ...draft, amount: event.target.value } }))} className="w-28 rounded-lg border border-white/15 bg-white/[0.06] px-2.5 py-1.5 text-sm text-white outline-none focus:border-[#ff6b32]" />
                <button type="button" onClick={() => handleSaveExpense(expense)} disabled={savingExpenseId === expense.id} className="rounded-full border border-white/15 px-3 py-1.5 text-[11px] font-bold text-white/70 transition hover:border-white/35 hover:text-white disabled:cursor-wait disabled:opacity-50">{savingExpenseId === expense.id ? "…" : "Salvar"}</button>
                <button type="button" onClick={() => onDeleteFixedExpense(expense.id)} className="text-[11px] font-bold text-red-400/80 hover:text-red-300">🗑</button>
              </div>
            );
          })}
        </div>
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <input type="text" value={newExpenseName} onChange={(event) => setNewExpenseName(event.target.value)} placeholder="Ex: Aluguel" className="min-w-0 flex-1 rounded-lg border border-white/15 bg-white/[0.06] px-2.5 py-1.5 text-sm text-white outline-none focus:border-[#ff6b32]" />
          <input type="text" inputMode="decimal" value={newExpenseAmount} onChange={(event) => setNewExpenseAmount(event.target.value)} placeholder="Valor mensal (R$)" className="w-40 rounded-lg border border-white/15 bg-white/[0.06] px-2.5 py-1.5 text-sm text-white outline-none focus:border-[#ff6b32]" />
          <button type="button" onClick={handleAddExpense} disabled={addingExpense} className="rounded-full bg-[#ff5a19] px-4 py-2 text-xs font-bold text-white transition hover:bg-[#ff6a2e] disabled:cursor-wait disabled:opacity-50">{addingExpense ? "Adicionando…" : "+ Adicionar"}</button>
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-[#171211] p-6">
        <p className="text-xs font-bold uppercase tracking-[.18em] text-[#ff7c50]">Qual prato dá mais lucro</p>
        <h3 className="mt-1 font-display text-lg font-extrabold tracking-[-.03em]">Margem pelo custo atual</h3>
        <p className="mt-1.5 text-sm text-white/50">Preço de venda menos o custo atual dos ingredientes (pela ficha técnica de hoje) — ajuda a decidir se algum prato precisa subir de preço.</p>
        <div className="mt-4 divide-y divide-white/10 rounded-xl border border-white/10">
          {ranking.length === 0 ? (
            <p className="p-4 text-sm text-white/50">Nenhum prato com ficha técnica cadastrada ainda.</p>
          ) : ranking.map((item) => (
            <div key={item.id} className="flex items-center justify-between gap-3 p-3">
              <span className="min-w-0 flex-1 truncate text-sm font-bold text-white">{item.name}</span>
              <span className="shrink-0 text-xs text-white/50">venda {formatTotal(item.price)} − custo {formatTotal(item.cost as number)}</span>
              <span className={`shrink-0 font-display text-sm font-extrabold ${item.margin >= 0 ? "text-emerald-400" : "text-red-400"}`}>{formatTotal(item.margin)}</span>
            </div>
          ))}
        </div>
        {incompleteCostItems.length > 0 && <p className="mt-3 text-[11px] text-amber-300/80">⚠️ {incompleteCostItems.length} prato{incompleteCostItems.length === 1 ? "" : "s"} com ficha técnica cadastrada mas custo incompleto (ingrediente nunca comprado ou apagado) — custo pode estar subestimado: {incompleteCostItems.map((item) => item.name).join(", ")}</p>}
        {itemsWithoutRecipe.length > 0 && <p className="mt-2 text-[11px] text-white/40">{itemsWithoutRecipe.length} prato{itemsWithoutRecipe.length === 1 ? "" : "s"} sem ficha técnica ainda (não aparecem no ranking): {itemsWithoutRecipe.map((item) => item.name).join(", ")}</p>}
      </div>
    </div>
  );
}

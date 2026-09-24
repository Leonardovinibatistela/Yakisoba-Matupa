import { useEffect, useRef, useState, type ReactNode } from "react";
import type { OrderRecord } from "./adminData";
import type { Ingredient } from "./ingredients";
import type { Recipes } from "./recipes";
import type { FixedExpense, FixedExpenseHistoryEntry } from "./fixedExpenses";
import type { PaymentFeeRates } from "./paymentFees";
import type { OrderCostRates } from "./orderCosts";
import EditableCell from "./EditableCell";
import { analyzeDishes, breakEven, ingredientsWithoutCost, paymentBreakdown, simulatePrice, soldByItem, suggestPrice, summarizeOrders, type BreakEven, type CatalogItem, type DishRow, type DishWithoutRecipe, type PeriodSummary } from "./financeiroMath";
import { SAVE_FAILED, parseNumber, toDraft, withTimeout } from "./stockFormat";

const money = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const pctText = (value: number | null) => (value === null ? "—" : `${Math.round(value * 100)}%`);
const PAYMENT_LABELS: Record<string, string> = { pix: "Pix", cartao: "Cartão", dinheiro: "Dinheiro", outro: "Sem forma informada" };
const compareText = (a: string, b: string) => a.localeCompare(b, "pt-BR", { sensitivity: "base" });
const toneFor = (value: number) => (value < 0 ? "text-red-400" : "text-emerald-400");
const marginTone = (value: number | null) => (value === null ? "text-slate-400" : value < 0.3 ? "text-red-600" : value < 0.5 ? "text-amber-700" : "text-emerald-700");

/** Valor que uma despesa fixa tinha no mês passado — o registro mais recente do histórico com data antes do início do mês atual (history já vem mais recente primeiro). null se não tem nenhum registro de antes desse mês. */
function lastMonthAmount(expenseId: string, history: FixedExpenseHistoryEntry[], monthStart: Date): number | null {
  const priorEntry = history.find((entry) => entry.expenseId === expenseId && entry.recordedAt < monthStart);
  return priorEntry ? priorEntry.amount : null;
}

function Card({ eyebrow, title, children, className = "" }: { eyebrow: string; title: string; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-white/10 bg-[#171211] p-4 sm:p-6 ${className}`}>
      <p className="text-xs font-bold uppercase tracking-[.18em] text-[#ff7c50]">{eyebrow}</p>
      <h3 className="mt-1 font-display text-lg font-extrabold tracking-[-.03em]">{title}</h3>
      {children}
    </section>
  );
}

function Line({ label, value, tone = "text-white", strong = false, sub = false }: { label: string; value: string; tone?: string; strong?: boolean; sub?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between gap-3 text-xs ${sub ? "py-0.5 pl-3 text-[11px]" : "py-1.5"}`}>
      <dt className={strong ? "font-bold text-white/85" : sub ? "text-white/40" : "text-white/55"}>{label}</dt>
      <dd className={`tabular-nums ${strong ? "font-bold" : ""} ${sub ? "text-white/40" : tone}`}>{value}</dd>
    </div>
  );
}

/** Um período como mini demonstrativo: vendas − ingredientes − taxas (− gastos fixos, no mês) = o que sobrou. */
function PeriodCard({ title, summary, fixedTotal, purchasesTotal }: { title: string; summary: PeriodSummary; fixedTotal?: number; purchasesTotal?: number }) {
  const isMonth = fixedTotal !== undefined;
  const result = isMonth ? summary.margem - fixedTotal : summary.margem;
  const uncertain = summary.parciais + summary.semCusto;
  const provisional = uncertain > 0;
  return (
    <div className="min-w-0 rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-2">
        <p className="text-[10px] font-bold uppercase tracking-[.14em] text-white/45">{title}</p>
        <p className="text-[11px] text-white/45">{summary.orders} pedido{summary.orders === 1 ? "" : "s"}{summary.ticket !== null ? ` · ticket ${money(summary.ticket)}` : ""}</p>
      </div>
      <dl className="mt-2 divide-y divide-white/5">
        <Line label="Vendas (bruto)" value={money(summary.bruto)} strong />
        {summary.taxaEntrega > 0 && <Line sub label={`inclui taxa de entrega · ${summary.entregas} entrega${summary.entregas === 1 ? "" : "s"}`} value={money(summary.taxaEntrega)} />}
        <Line label="− Ingredientes" value={money(summary.custo)} />
        <Line label="− Taxas de pagamento" value={money(summary.taxas)} />
        <Line label="− Embalagem" value={money(summary.embalagem)} />
        <Line label={`− Motoboy${summary.entregas > 0 ? ` (${summary.entregas} entrega${summary.entregas === 1 ? "" : "s"})` : ""}`} value={money(summary.motoboy)} />
        {isMonth && <Line label="− Gastos fixos do mês inteiro" value={money(fixedTotal)} />}
      </dl>
      <div className="mt-2 rounded-lg bg-white/[0.05] px-3 py-2.5">
        <p className="text-[10px] font-bold uppercase tracking-[.14em] text-white/45">{isMonth ? "Lucro líquido do mês (até agora)" : "Sobra do período"}{provisional ? " · provisório" : summary.margemPct !== null && !isMonth ? ` · ${pctText(summary.margemPct)}` : ""}</p>
        <p className={`mt-0.5 font-display text-2xl font-extrabold tabular-nums ${provisional ? "text-amber-300" : toneFor(result)}`}>{money(result)}</p>
        {isMonth && <p className="mt-0.5 text-[11px] text-white/45">Antes dos gastos fixos sobrou {money(summary.margem)}{summary.margemPct !== null ? ` (${pctText(summary.margemPct)})` : ""}.</p>}
      </div>
      {isMonth && purchasesTotal !== undefined && <p className="mt-2 text-[11px] text-white/40" title="Inclui compra de ingrediente que ainda não foi vendido">Comprado de ingredientes no mês: <span className="font-bold text-white/60">{money(purchasesTotal)}</span> (aproximado)</p>}
      {uncertain > 0 && <p className="mt-2 text-[11px] text-amber-300/80">⚠️ {uncertain} de {summary.orders} pedido{summary.orders === 1 ? "" : "s"} sem custo completo (prato sem ficha técnica, ingrediente sem compra ou pedido de antes do sistema) — esse valor está maior do que o real.</p>}
    </div>
  );
}

function HealthItem({ ok, info, title, hint }: { ok: boolean; info?: boolean; title: ReactNode; hint?: ReactNode }) {
  return (
    <li className="flex gap-2.5 text-sm">
      <span className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full text-[11px] font-bold ${ok ? "bg-emerald-500/20 text-emerald-300" : info ? "bg-white/10 text-white/60" : "bg-amber-400/20 text-amber-300"}`}>{ok ? "✓" : info ? "i" : "!"}</span>
      <div className="min-w-0"><p className={ok ? "text-white/65" : "text-white/90"}>{title}</p>{hint && <p className="mt-0.5 text-xs text-white/45">{hint}</p>}</div>
    </li>
  );
}

function BreakEvenCard({ be, bruto }: { be: BreakEven; bruto: number }) {
  const hasFixed = be.fixedTotal > 0;
  const provisional = be.basis === "estimada";
  return (
    <Card eyebrow="Ponto de equilíbrio do mês" title={!hasFixed ? "Cadastra os gastos fixos pra ver quanto precisa vender" : be.needed === null ? "Ainda não dá pra calcular — faltam vendas com custo" : provisional ? "Provisório — falta o custo dos ingredientes pra saber de verdade" : be.covered ? "✅ Gastos fixos do mês já cobertos" : `Faltam ${money(be.missing)} de vendas pra cobrir os gastos fixos`}>
      {hasFixed && be.needed !== null && (
        <>
          <div className="mt-4 h-3 overflow-hidden rounded-full bg-white/10" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(be.progress * 100)} aria-label="Quanto do ponto de equilíbrio já foi vendido">
            <div className={`h-full rounded-full ${provisional ? "bg-amber-400" : be.covered ? "bg-emerald-400" : "bg-[#ff5a19]"}`} style={{ width: `${Math.round(be.progress * 100)}%` }} />
          </div>
          <p className="mt-1.5 text-xs text-white/55">Vendeu <strong className="text-white/85">{money(bruto)}</strong> de {provisional ? "no mínimo " : ""}<strong className="text-white/85">{money(be.needed)}</strong> necessários ({Math.round(be.progress * 100)}%)</p>
        </>
      )}
      <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ["Gastos fixos do mês", money(be.fixedTotal)],
          ["Margem usada na conta", pctText(be.marginPct) + (be.basis === "completa" ? "" : " (estimada)")],
          ["Média por dia", money(bruto / be.daysElapsed)],
          [`Projeção pra fechar o mês`, money(be.projected)],
        ].map(([label, value]) => (
          <div key={label} className="rounded-lg bg-white/[0.04] px-3 py-2"><dt className="text-[10px] font-bold uppercase tracking-[.12em] text-white/40">{label}</dt><dd className="mt-0.5 text-sm font-bold tabular-nums text-white/90">{value}</dd></div>
        ))}
      </dl>
      {hasFixed && be.needed !== null && !provisional && <p className={`mt-3 text-xs ${be.projected >= be.needed ? "text-emerald-300/80" : "text-amber-300/80"}`}>{be.projected >= be.needed ? "No ritmo de hoje, o mês fecha cobrindo os gastos fixos." : "No ritmo de hoje, o mês ainda não cobre os gastos fixos — projeção de vendas abaixo do necessário."}</p>}
      {be.basis === "estimada" && hasFixed && <p className="mt-2 text-xs text-amber-300/80">⚠️ Nenhum pedido do mês tem custo completo ainda, então a margem acima é só bruto menos taxas. Por isso o ponto de equilíbrio de verdade é MAIOR do que o mostrado aqui — preenche as fichas técnicas e registra as compras dos ingredientes.</p>}
    </Card>
  );
}

function PaymentTable({ rows }: { rows: ReturnType<typeof paymentBreakdown> }) {
  return (
    <div className="mt-4 overflow-x-auto rounded-md border border-slate-300 bg-white text-[13px] text-slate-800 shadow-sm">
      <table className="w-full min-w-[420px] border-collapse">
        <thead><tr className="bg-slate-100 text-left text-[11px] font-bold uppercase tracking-wide text-slate-600">
          <th className="border border-slate-300 px-3 py-2">Forma de pagamento</th><th className="border border-slate-300 px-3 py-2 text-right">Pedidos</th><th className="border border-slate-300 px-3 py-2 text-right">Vendas</th><th className="border border-slate-300 px-3 py-2 text-right">Taxa</th><th className="border border-slate-300 px-3 py-2 text-right">Fica pra você</th>
        </tr></thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.method}>
              <td className="border border-slate-300 px-3 py-2 font-semibold">{PAYMENT_LABELS[row.method]}</td>
              <td className="border border-slate-300 px-3 py-2 text-right tabular-nums">{row.orders}</td>
              <td className="border border-slate-300 px-3 py-2 text-right tabular-nums">{money(row.bruto)}</td>
              <td className="border border-slate-300 px-3 py-2 text-right tabular-nums text-slate-600">{row.rate > 0 ? `${(row.rate * 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}% · ${money(row.fee)}` : "sem taxa"}</td>
              <td className="border border-slate-300 px-3 py-2 text-right font-bold tabular-nums">{money(row.bruto - row.fee)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

type DishSortKey = "name" | "sold" | "price" | "cost" | "margin" | "marginPct" | "profit";
const DISH_HEADERS: { key: DishSortKey; label: string; align: "left" | "right"; hint?: string }[] = [
  { key: "name", label: "Prato", align: "left" },
  { key: "sold", label: "Vendidos no mês", align: "right" },
  { key: "price", label: "Preço", align: "right" },
  { key: "cost", label: "Custo", align: "right", hint: "Pela ficha técnica, com o custo médio atual dos ingredientes." },
  { key: "margin", label: "Sobra por prato", align: "right", hint: "Preço − custo dos ingredientes (antes de taxas, embalagem, motoboy e gastos fixos — esses são por pedido, não por prato)." },
  { key: "marginPct", label: "Margem", align: "right", hint: "Quanto do preço sobra depois do custo dos ingredientes. Abaixo de 30% pede atenção." },
  { key: "profit", label: "Lucro no mês", align: "right", hint: "Sobra por prato × quantidade vendida no mês (estimativa, com o custo de hoje)." },
];

const MARGIN_CHOICES = [45, 50, 55, 60, 65, 70];
const LOW_MARGIN = 0.5;

/** "Quanto cobrar?" — escolhe a margem que quer e vê o preço, a sobra e o que muda no lucro do mês. Só simula: não mexe no cardápio. */
function PriceSimulator({ dish, onClose }: { dish: DishRow; onClose: () => void }) {
  const [target, setTarget] = useState(dish.marginPct !== null && dish.marginPct < LOW_MARGIN ? 50 : 60);
  const [manual, setManual] = useState("");
  const suggested = suggestPrice(dish.cost, target / 100);
  const manualPrice = manual.trim() === "" ? null : parseNumber(manual);
  const manualInvalid = manualPrice !== null && !(manualPrice > 0);
  const price = manualPrice !== null && !manualInvalid ? manualPrice : suggested;
  const sim = price !== null ? simulatePrice(dish, price) : null;
  const gainTone = sim && sim.ganhoMes > 0 ? "text-emerald-700" : sim && sim.ganhoMes < 0 ? "text-red-600" : "text-slate-700";
  return (
    <section aria-label={`Simulador de preço: ${dish.name}`} className="mt-4 rounded-md border-2 border-sky-500 bg-sky-50 p-3 text-[13px] text-slate-800 shadow-md shadow-sky-900/20 sm:p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h4 className="text-sm font-extrabold text-sky-900">💲 Simulador de preço — {dish.name}</h4>
        <button type="button" onClick={onClose} className="rounded border border-sky-300 bg-white px-2.5 py-1 text-xs font-bold text-sky-800 hover:bg-sky-100">Fechar</button>
      </div>
      <p className="mt-1.5 text-xs text-slate-600">Hoje: preço <strong>{money(dish.price)}</strong>, custo <strong>{dish.complete ? "" : "≥ "}{money(dish.cost)}</strong>, margem <strong>{pctText(dish.marginPct)}</strong>, {dish.sold} vendido{dish.sold === 1 ? "" : "s"} no mês.</p>
      {!dish.complete && <p className="mt-1.5 rounded bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-800">⚠️ O custo desse prato ainda está incompleto (falta: {dish.missingNames.join(", ")}). O preço sugerido pode sair baixo demais.</p>}

      <p className="mt-3 text-[11px] font-extrabold uppercase tracking-wide text-slate-600">Que margem você quer?</p>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {MARGIN_CHOICES.map((choice) => (
          <button key={choice} type="button" onClick={() => { setTarget(choice); setManual(""); }} aria-pressed={manualPrice === null && target === choice} className={`min-h-[36px] rounded-full border px-3 py-1 text-xs font-bold ${manualPrice === null && target === choice ? "border-sky-600 bg-sky-600 text-white" : "border-sky-300 bg-white text-sky-800 hover:bg-sky-100"}`}>{choice}%</button>
        ))}
      </div>
      <p className="mt-1 text-[11px] text-slate-500">A planilha do cliente usa custo ÷ 0,56, que dá cerca de 44% de margem.</p>

      <div className="mt-3 grid gap-3 sm:grid-cols-[auto_1fr] sm:items-end">
        <div>
          <p className="text-[11px] font-extrabold uppercase tracking-wide text-slate-600">Preço sugerido (termina em ,90)</p>
          <p className="mt-0.5 font-display text-2xl font-extrabold tabular-nums text-sky-900">{suggested !== null ? money(suggested) : "—"}</p>
        </div>
        <div>
          <label htmlFor={`sim-price-${dish.id}`} className="block text-[11px] font-extrabold uppercase tracking-wide text-slate-600">Ou digite um preço pra testar</label>
          <input id={`sim-price-${dish.id}`} type="text" inputMode="decimal" value={manual} onChange={(event) => setManual(event.target.value)} placeholder="ex: 59,90" className="mt-1 min-h-[40px] w-full max-w-[10rem] rounded-md border-2 border-slate-300 bg-white px-2.5 py-1.5 text-[16px] text-slate-900 outline-none placeholder:text-slate-400 focus:border-sky-600 md:text-[14px]" />
          {manualInvalid && <p role="alert" className="mt-1 text-xs font-semibold text-red-600">Digite um valor maior que zero.</p>}
        </div>
      </div>

      {sim && (
        <dl className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
          {[
            ["Preço novo", money(sim.price), "text-slate-900"],
            ["Sobra por prato", money(sim.sobra), sim.sobra < 0 ? "text-red-600" : "text-slate-900"],
            ["Margem", pctText(sim.marginPct), marginTone(sim.marginPct)],
            ["Lucro no mês", dish.sold > 0 ? money(sim.lucroMes) : "—", "text-slate-900"],
            ["Muda no mês", dish.sold > 0 ? `${sim.ganhoMes > 0 ? "+" : ""}${money(sim.ganhoMes)}` : "—", gainTone],
          ].map(([label, value, tone]) => (
            <div key={label} className="rounded border border-sky-200 bg-white px-2.5 py-1.5"><dt className="text-[10px] font-bold uppercase text-slate-500">{label}</dt><dd className={`font-bold tabular-nums ${tone}`}>{value}</dd></div>
          ))}
        </dl>
      )}
      <ul className="mt-3 space-y-1 text-[11px] leading-snug text-slate-500">
        <li>A conta usa a quantidade vendida neste mês. <strong className="text-slate-700">Preço maior pode vender menos</strong>, então o ganho só vale se as vendas se mantiverem.</li>
        <li>Só conta o custo dos ingredientes e da embalagem da ficha. Gás, mão de obra e aluguel não entram.</li>
        <li>Pra mudar o preço no site: <strong className="text-slate-700">Cardápio</strong> → campo de preço do prato.</li>
      </ul>
    </section>
  );
}

function DishSheet({ rows, withoutRecipe }: { rows: DishRow[]; withoutRecipe: DishWithoutRecipe[] }) {
  const [onlyLow, setOnlyLow] = useState(false);
  const [simulatingId, setSimulatingId] = useState<string | null>(null);
  const simulating = simulatingId ? rows.find((dish) => dish.id === simulatingId) ?? null : null;
  const isLow = (dish: DishRow) => dish.marginPct !== null && dish.marginPct < LOW_MARGIN;
  const lowCount = rows.filter(isLow).length;
  const [sort, setSort] = useState<{ key: DishSortKey; dir: 1 | -1 }>({ key: "profit", dir: -1 });
  const toggle = (key: DishSortKey) => setSort((current) => (current.key === key ? { key, dir: current.dir === 1 ? -1 : 1 } : { key, dir: key === "name" ? 1 : -1 }));
  const sorted = [...rows].sort((a, b) => {
    const result = sort.key === "name" ? compareText(a.name, b.name) : ((a[sort.key] ?? -Infinity) as number) - ((b[sort.key] ?? -Infinity) as number);
    return Number.isNaN(result) || result === 0 ? compareText(a.name, b.name) : result * sort.dir;
  });
  const visible = onlyLow ? sorted.filter(isLow) : sorted;
  const soldWithoutRecipe = withoutRecipe.filter((dish) => dish.sold > 0);
  const restWithoutRecipe = withoutRecipe.filter((dish) => dish.sold === 0);
  return (
    <>
      {rows.length === 0 ? (
        <p className="mt-4 rounded-xl border border-white/10 p-4 text-sm text-white/50">Nenhum prato com ficha técnica ainda. Preenche em Cardápio → botão 🧂 Ficha técnica de cada prato.</p>
      ) : (
        <>
          <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
            <button type="button" onClick={() => setOnlyLow((current) => !current)} aria-pressed={onlyLow} className={`min-h-[36px] rounded-full border px-3.5 py-1.5 font-bold transition ${onlyLow ? "border-amber-400 bg-amber-400 text-slate-900" : "border-white/20 text-white/75 hover:border-white/40 hover:text-white"}`}>{onlyLow ? "✓ " : ""}Só margem abaixo de {Math.round(LOW_MARGIN * 100)}% ({lowCount})</button>
            <span className="text-white/45">Clique em <strong className="text-white/70">💲 Simular</strong> num prato pra ver quanto cobrar.</span>
          </div>
          {simulating && <PriceSimulator key={simulating.id} dish={simulating} onClose={() => setSimulatingId(null)} />}
          {visible.length === 0 && <p className="mt-4 rounded-xl border border-white/10 p-4 text-sm text-white/55">Nenhum prato com margem abaixo de {Math.round(LOW_MARGIN * 100)}%. 🎉</p>}
          <div className="mt-4 hidden max-h-[70vh] overflow-auto rounded-md border border-slate-300 bg-white text-[13px] text-slate-800 shadow-sm md:block">
            <table className="w-full min-w-[720px] border-collapse">
              <thead className="sticky top-0 z-10"><tr>
                {DISH_HEADERS.map((header) => (
                  <th key={header.key} title={header.hint} onClick={() => toggle(header.key)} className={`cursor-pointer select-none border border-slate-300 bg-slate-100 px-2.5 py-2 text-[11px] font-bold uppercase tracking-wide text-slate-600 hover:bg-slate-200 ${header.align === "right" ? "text-right" : "text-left"}`}>{header.label} <span className="text-slate-400">{sort.key === header.key ? (sort.dir === 1 ? "▲" : "▼") : ""}</span></th>
                ))}
                <th className="border border-slate-300 bg-slate-100 px-2.5 py-2 text-center text-[11px] font-bold uppercase tracking-wide text-slate-600">Preço</th>
              </tr></thead>
              <tbody>
                {visible.map((dish) => (
                  <tr key={dish.id} className={dish.complete ? "" : "bg-amber-50"}>
                    <td className="border border-slate-300 px-2.5 py-2 font-semibold">{dish.name}{!dish.complete && <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800" title={`Falta custo de: ${dish.missingNames.join(", ")}`}>custo parcial</span>}</td>
                    <td className="border border-slate-300 px-2.5 py-2 text-right tabular-nums">{dish.sold}</td>
                    <td className="border border-slate-300 px-2.5 py-2 text-right tabular-nums">{money(dish.price)}</td>
                    <td className="border border-slate-300 px-2.5 py-2 text-right tabular-nums text-slate-600">{dish.complete ? "" : "≥ "}{money(dish.cost)}</td>
                    <td className={`border border-slate-300 px-2.5 py-2 text-right font-bold tabular-nums ${dish.margin < 0 ? "text-red-600" : ""}`}>{dish.complete ? "" : "≤ "}{money(dish.margin)}</td>
                    <td className={`border border-slate-300 px-2.5 py-2 text-right font-bold tabular-nums ${dish.complete ? marginTone(dish.marginPct) : "text-slate-500"}`}>{dish.complete ? "" : "≤ "}{pctText(dish.marginPct)}</td>
                    <td className="border border-slate-300 px-2.5 py-2 text-right font-bold tabular-nums">{dish.sold > 0 ? `${dish.complete ? "" : "≤ "}${money(dish.profit)}` : <span className="font-normal text-slate-300">—</span>}</td>
                    <td className="border border-slate-300 px-2 py-1.5 text-center"><button type="button" onClick={() => setSimulatingId(dish.id === simulatingId ? null : dish.id)} aria-label={`Simular preço de ${dish.name}`} className={`whitespace-nowrap rounded-full border px-2.5 py-1 text-[11px] font-bold ${dish.id === simulatingId ? "border-sky-600 bg-sky-600 text-white" : "border-sky-300 bg-sky-50 text-sky-800 hover:bg-sky-100"}`}>💲 Simular</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4 space-y-2 md:hidden">
            {visible.map((dish) => (
              <div key={dish.id} className={`overflow-hidden rounded-md border border-slate-300 text-[13px] text-slate-800 ${dish.complete ? "bg-white" : "bg-amber-50"}`}>
                <div className="flex items-start justify-between gap-2 border-b border-slate-200 px-3 py-2"><span className="font-bold">{dish.name}</span><span className="shrink-0 text-xs text-slate-500">{dish.sold} vendido{dish.sold === 1 ? "" : "s"}</span></div>
                <dl className="grid grid-cols-2 divide-x divide-slate-200">
                  {[["Preço", money(dish.price), ""], ["Custo", `${dish.complete ? "" : "≥ "}${money(dish.cost)}`, ""], ["Sobra por prato", `${dish.complete ? "" : "≤ "}${money(dish.margin)}`, dish.margin < 0 ? "text-red-600" : ""], ["Margem", `${dish.complete ? "" : "≤ "}${pctText(dish.marginPct)}`, dish.complete ? marginTone(dish.marginPct) : "text-slate-500"]].map(([label, value, tone]) => (
                    <div key={label} className="border-b border-slate-200 px-3 py-1.5 last:border-b-0"><dt className="text-[10px] font-bold uppercase text-slate-500">{label}</dt><dd className={`font-bold tabular-nums ${tone}`}>{value}</dd></div>
                  ))}
                </dl>
                <p className="border-t border-slate-200 px-3 py-1.5 text-xs text-slate-600">Lucro no mês: <strong className="tabular-nums text-slate-800">{dish.sold > 0 ? `${dish.complete ? "" : "≤ "}${money(dish.profit)}` : "—"}</strong>{!dish.complete ? <span className="ml-2 text-amber-800">· custo parcial</span> : ""}</p>
                <div className="border-t border-slate-200 px-3 py-2"><button type="button" onClick={() => setSimulatingId(dish.id === simulatingId ? null : dish.id)} aria-label={`Simular preço de ${dish.name}`} className={`min-h-[40px] rounded-full border px-3.5 py-1.5 text-xs font-bold ${dish.id === simulatingId ? "border-sky-600 bg-sky-600 text-white" : "border-sky-300 bg-sky-50 text-sky-800"}`}>💲 Simular preço</button></div>
              </div>
            ))}
          </div>
        </>
      )}
      {soldWithoutRecipe.length > 0 && (
        <div className="mt-4 rounded-xl border border-amber-400/30 bg-amber-400/5 p-3">
          <p className="text-sm font-bold text-amber-200">Preenche primeiro a ficha destes — já venderam no mês e ainda não têm ficha técnica:</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {soldWithoutRecipe.slice(0, 12).map((dish) => <span key={dish.id} className="rounded-full bg-amber-400/15 px-2.5 py-1 text-xs font-bold text-amber-200">{dish.name} · {dish.sold}×</span>)}
            {soldWithoutRecipe.length > 12 && <span className="rounded-full bg-white/10 px-2.5 py-1 text-xs text-white/60">+ {soldWithoutRecipe.length - 12}</span>}
          </div>
        </div>
      )}
      {restWithoutRecipe.length > 0 && (
        <details className="mt-3 text-xs text-white/50">
          <summary className="cursor-pointer font-bold text-white/60">{restWithoutRecipe.length} prato{restWithoutRecipe.length === 1 ? "" : "s"} sem ficha técnica que não venderam no mês</summary>
          <p className="mt-1.5 leading-relaxed text-white/40">{restWithoutRecipe.map((dish) => dish.name).join(", ")}</p>
        </details>
      )}
    </>
  );
}

function PaymentFeesEditor({ rates, onSave, onSaved }: { rates: PaymentFeeRates; onSave: (rates: PaymentFeeRates) => Promise<void>; onSaved: (message: string) => void }) {
  const pctDraft = (value: number) => String(Number((value * 100).toFixed(4))).replace(".", ",");
  const [drafts, setDrafts] = useState({ pix: pctDraft(rates.pix), cartao: pctDraft(rates.cartao), dinheiro: pctDraft(rates.dinheiro) });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const parsePct = (raw: string) => (raw.trim() === "" ? 0 : parseNumber(raw));
  const invalid = (Object.keys(drafts) as (keyof PaymentFeeRates)[]).some((method) => { const value = parsePct(drafts[method]); return Number.isNaN(value) || value < 0 || value > 100; });
  const cardExample = 100 * (parsePct(drafts.cartao) / 100);
  const handleSave = () => {
    if (invalid) { setError("Cada taxa tem que ser um número de 0 a 100."); return; }
    setError(null);
    setSaving(true);
    withTimeout(onSave({ pix: parsePct(drafts.pix) / 100, cartao: parsePct(drafts.cartao) / 100, dinheiro: parsePct(drafts.dinheiro) / 100 }))
      .then(() => onSaved("Taxas de pagamento salvas"))
      .catch(() => setError(SAVE_FAILED))
      .finally(() => setSaving(false));
  };
  return (
    <Card eyebrow="Taxa de pagamento" title="Quanto a maquininha/plataforma come de cada venda">
      <p className="mt-1.5 text-sm text-white/50">Em porcentagem do valor do pedido. Deixa 0 pra forma de pagamento que não tem taxa (ex.: Pix, dinheiro).</p>
      <div className="mt-4 flex flex-wrap items-end gap-3">
        {(["pix", "cartao", "dinheiro"] as const).map((method) => (
          <div key={method}>
            <label htmlFor={`fee-${method}`} className="text-[10px] font-bold uppercase tracking-[.14em] text-white/45">{PAYMENT_LABELS[method]} (%)</label>
            <input id={`fee-${method}`} type="text" inputMode="decimal" value={drafts[method]} onChange={(event) => { setDrafts((current) => ({ ...current, [method]: event.target.value })); setError(null); }} className="mt-1.5 min-h-[44px] w-28 rounded-lg border border-white/15 bg-white/[0.06] px-2.5 py-1.5 text-[16px] text-white outline-none focus:border-[#ff6b32] md:min-h-0 md:text-sm" />
          </div>
        ))}
        <button type="button" onClick={handleSave} disabled={saving} className="min-h-[44px] rounded-full bg-[#ff5a19] px-5 py-2 text-xs font-bold text-white transition hover:bg-[#ff6a2e] disabled:cursor-wait disabled:opacity-50 md:min-h-0">{saving ? "Salvando…" : "Salvar taxas"}</button>
      </div>
      {!invalid && parsePct(drafts.cartao) > 0 && <p className="mt-2 text-xs text-white/45">Exemplo: numa venda de R$ 100,00 no cartão, a taxa é {money(cardExample)}.</p>}
      {error && <p role="alert" className="mt-2 text-xs font-semibold text-red-400">{error}</p>}
    </Card>
  );
}

function OrderCostsEditor({ rates, monthOrders, monthDeliveries, avgDeliveryFee, onSave, onSaved }: { rates: OrderCostRates; monthOrders: number; monthDeliveries: number; avgDeliveryFee: number | null; onSave: (rates: OrderCostRates) => Promise<void>; onSaved: (message: string) => void }) {
  const [drafts, setDrafts] = useState({ packaging: toDraft(rates.packaging), courier: toDraft(rates.courier) });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const parseMoney = (raw: string) => (raw.trim() === "" ? 0 : parseNumber(raw));
  const packaging = parseMoney(drafts.packaging);
  const courier = parseMoney(drafts.courier);
  const invalid = [packaging, courier].some((value) => Number.isNaN(value) || value < 0 || value > 1000);
  const handleSave = () => {
    if (invalid) { setError("Cada valor tem que ser um número em reais, de 0 a 1000."); return; }
    setError(null);
    setSaving(true);
    withTimeout(onSave({ packaging, courier }))
      .then(() => onSaved("Embalagem e motoboy salvos"))
      .catch(() => setError(SAVE_FAILED))
      .finally(() => setSaving(false));
  };
  const fields = [
    { key: "packaging" as const, label: "Embalagem por pedido (R$)", hint: "Caixinha, sacola, hashi, molho... tudo que vai junto. Vale pra todo pedido." },
    { key: "courier" as const, label: "Motoboy por entrega (R$)", hint: "O que você paga ao motoboy em cada entrega. Só conta nos pedidos de entrega." + (avgDeliveryFee !== null ? " Se ele fica com toda a taxa que o cliente paga (" + money(avgDeliveryFee) + "), digita " + toDraft(avgDeliveryFee) + "." : "") },
  ];
  return (
    <Card eyebrow="Embalagem e motoboy" title="O que cada pedido custa além dos ingredientes">
      <p className="mt-1.5 text-sm text-white/50">Sem isso o lucro fica maior do que é de verdade. Vale também pros pedidos que já saíram (usa o valor de hoje). Deixa 0 no que você não tem.</p>
      <div className="mt-4 flex flex-wrap items-start gap-3">
        {fields.map((field) => (
          <div key={field.key} className="w-full max-w-[15rem]">
            <label htmlFor={"ordercost-" + field.key} className="text-[10px] font-bold uppercase tracking-[.14em] text-white/45">{field.label}</label>
            <input id={"ordercost-" + field.key} type="text" inputMode="decimal" value={drafts[field.key]} onChange={(event) => { setDrafts((current) => ({ ...current, [field.key]: event.target.value })); setError(null); }} onKeyDown={(event) => { if (event.key === "Enter") handleSave(); }} className="mt-1.5 min-h-[44px] w-full rounded-lg border border-white/15 bg-white/[0.06] px-2.5 py-1.5 text-[16px] text-white outline-none focus:border-[#ff6b32] md:min-h-0 md:text-sm" />
            <p className="mt-1 text-[11px] leading-snug text-white/40">{field.hint}</p>
          </div>
        ))}
        <button type="button" onClick={handleSave} disabled={saving} className="min-h-[44px] rounded-full bg-[#ff5a19] px-5 py-2 text-xs font-bold text-white transition hover:bg-[#ff6a2e] disabled:cursor-wait disabled:opacity-50 sm:mt-[1.375rem] md:min-h-0">{saving ? "Salvando…" : "Salvar"}</button>
      </div>
      {!invalid && monthOrders > 0 && (packaging > 0 || courier > 0) && (
        <p className="mt-3 text-xs text-white/45">Neste mês dá: {monthOrders} pedido{monthOrders === 1 ? "" : "s"} × {money(packaging)} = <strong className="text-white/70">{money(monthOrders * packaging)}</strong> de embalagem e {monthDeliveries} entrega{monthDeliveries === 1 ? "" : "s"} × {money(courier)} = <strong className="text-white/70">{money(monthDeliveries * courier)}</strong> de motoboy.</p>
      )}
      {error && <p role="alert" className="mt-2 text-xs font-semibold text-red-400">{error}</p>}
    </Card>
  );
}

export default function FinanceiroPanel({ todayOrders, weekOrders, monthOrders, monthPurchasesTotal, ingredients, recipes, fixedExpenses, fixedExpenseHistory, paymentFeeRates, orderCostRates, itemCatalog, onAddFixedExpense, onUpdateFixedExpense, onDeleteFixedExpense, onSetPaymentFeeRates, onSetOrderCostRates }: { todayOrders: OrderRecord[]; weekOrders: OrderRecord[]; monthOrders: OrderRecord[]; monthPurchasesTotal: number; ingredients: Ingredient[]; recipes: Recipes; fixedExpenses: FixedExpense[]; fixedExpenseHistory: FixedExpenseHistoryEntry[]; paymentFeeRates: PaymentFeeRates; orderCostRates: OrderCostRates; itemCatalog: CatalogItem[]; onAddFixedExpense: (name: string, amount: number) => Promise<void>; onUpdateFixedExpense: (id: string, name: string, amount: number) => Promise<void>; onDeleteFixedExpense: (id: string) => Promise<void>; onSetPaymentFeeRates: (rates: PaymentFeeRates) => Promise<void>; onSetOrderCostRates: (rates: OrderCostRates) => Promise<void> }) {
  const [newExpenseName, setNewExpenseName] = useState("");
  const [newExpenseAmount, setNewExpenseAmount] = useState("");
  const [addingExpense, setAddingExpense] = useState(false);
  const [addExpenseError, setAddExpenseError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (toastTimerRef.current) clearTimeout(toastTimerRef.current); }, []);
  const showToast = (message: string) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast(message);
    toastTimerRef.current = setTimeout(() => setToast(null), 2500);
  };

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const today = summarizeOrders(todayOrders, paymentFeeRates, orderCostRates);
  const week = summarizeOrders(weekOrders, paymentFeeRates, orderCostRates);
  const month = summarizeOrders(monthOrders, paymentFeeRates, orderCostRates);
  const fixedTotal = fixedExpenses.reduce((total, expense) => total + expense.amount, 0);
  const be = breakEven(month, fixedTotal, now);
  const payments = paymentBreakdown(monthOrders, paymentFeeRates);
  const { withRecipe, withoutRecipe } = analyzeDishes(itemCatalog, recipes, ingredients, soldByItem(monthOrders));
  const dishesTotal = withRecipe.length + withoutRecipe.length;
  const noCostIngredients = ingredientsWithoutCost(ingredients, recipes);
  const allRatesZero = paymentFeeRates.pix === 0 && paymentFeeRates.cartao === 0 && paymentFeeRates.dinheiro === 0;
  const noOrderCosts = orderCostRates.packaging === 0 && orderCostRates.courier === 0;
  const costOk = month.orders === 0 || month.completos === month.orders;
  const allGood = costOk && withoutRecipe.length === 0 && noCostIngredients.length === 0 && fixedExpenses.length > 0;

  const handleAddExpense = () => {
    const name = newExpenseName.trim();
    const amount = parseNumber(newExpenseAmount);
    if (!name || addingExpense) return;
    if (!(amount > 0)) { setAddExpenseError("Digita o valor mensal (maior que zero)."); return; }
    if (fixedExpenses.some((expense) => compareText(expense.name.trim(), name) === 0)) { setAddExpenseError(`Já existe uma despesa chamada "${name}". Clica no valor dela na tabela pra mudar.`); return; }
    setAddExpenseError(null);
    setAddingExpense(true);
    withTimeout(onAddFixedExpense(name, amount))
      .then(() => { setNewExpenseName(""); setNewExpenseAmount(""); showToast(`Despesa "${name}" adicionada`); })
      .catch(() => setAddExpenseError(SAVE_FAILED))
      .finally(() => setAddingExpense(false));
  };
  const saveExpenseName = async (expense: FixedExpense, raw: string): Promise<string | null> => {
    const name = raw.trim();
    if (!name) return "O nome não pode ficar vazio.";
    try { await withTimeout(onUpdateFixedExpense(expense.id, name, expense.amount)); showToast(`Nome salvo: ${name}`); return null; } catch { return SAVE_FAILED; }
  };
  const saveExpenseAmount = async (expense: FixedExpense, raw: string): Promise<string | null> => {
    const amount = parseNumber(raw);
    if (!(amount > 0)) return "Digita um valor maior que zero.";
    try { await withTimeout(onUpdateFixedExpense(expense.id, expense.name, amount)); showToast(`${expense.name}: ${money(amount)} por mês`); return null; } catch { return SAVE_FAILED; }
  };
  const handleDeleteExpense = (expense: FixedExpense) => {
    if (!window.confirm(`Apagar a despesa "${expense.name}"? Ela deixa de entrar no lucro líquido do mês.`)) return;
    withTimeout(onDeleteFixedExpense(expense.id)).then(() => showToast(`Despesa "${expense.name}" apagada`)).catch(() => window.alert(SAVE_FAILED));
  };

  const sheetInput = "mt-1 min-h-[44px] w-full rounded-md border-2 border-slate-300 bg-white px-3 py-2 text-[16px] text-slate-900 outline-none placeholder:text-slate-400 focus:border-sky-600 md:text-[14px]";

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-bold uppercase tracking-[.18em] text-[#ff7c50]">Financeiro</p>
        <h2 className="mt-1 font-display text-xl font-extrabold tracking-[-.03em]">Bruto, custo e lucro real</h2>
      </div>

      <Card eyebrow="Confiança dos números" title={allGood ? "Tudo certo — os números abaixo são confiáveis" : "Falta completar algumas coisas pra os números serem confiáveis"}>
        {month.orders > 0 && (
          <div className="mt-4">
            <div className="h-2.5 overflow-hidden rounded-full bg-white/10" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round((month.completos / month.orders) * 100)} aria-label="Pedidos do mês com custo completo"><div className="h-full rounded-full bg-emerald-400" style={{ width: `${(month.completos / month.orders) * 100}%` }} /></div>
            <p className="mt-1.5 text-xs text-white/55"><strong className="text-white/85">{month.completos} de {month.orders}</strong> pedidos do mês com custo completo</p>
          </div>
        )}
        <ul className="mt-4 space-y-3">
          <HealthItem ok={costOk} title={month.orders === 0 ? "Ainda sem pedidos no mês" : costOk ? "Todos os pedidos do mês têm custo completo" : `${month.orders - month.completos} pedido${month.orders - month.completos === 1 ? "" : "s"} do mês sem custo completo`} hint={!costOk ? `${month.semCusto} nunca descontaram estoque (pedido de antes do sistema, ou o painel estava fechado) · ${month.parciais} tinham prato sem ficha técnica ou ingrediente sem compra. Esses entram com custo R$ 0 e o lucro fica maior do que é.` : undefined} info={month.orders === 0} />
          <HealthItem ok={withoutRecipe.length === 0} title={withoutRecipe.length === 0 ? `Os ${dishesTotal} pratos têm ficha técnica` : `${withRecipe.length} de ${dishesTotal} pratos com ficha técnica`} hint={withoutRecipe.length > 0 ? "Cardápio → botão 🧂 Ficha técnica de cada prato (começa pelos que mais vendem, lista mais abaixo)." : undefined} />
          <HealthItem ok={noCostIngredients.length === 0} title={noCostIngredients.length === 0 ? "Todos os ingredientes das fichas têm compra registrada" : `${noCostIngredients.length} ingrediente${noCostIngredients.length === 1 ? "" : "s"} de ficha sem compra registrada`} hint={noCostIngredients.length > 0 ? `Sem compra o custo é desconhecido: ${noCostIngredients.slice(0, 6).map((ingredient) => ingredient.name).join(", ")}${noCostIngredients.length > 6 ? "…" : ""}. Estoque → ＋ Compra.` : undefined} />
          <HealthItem ok={fixedExpenses.length > 0} title={fixedExpenses.length > 0 ? `${fixedExpenses.length} despesa${fixedExpenses.length === 1 ? "" : "s"} fixa${fixedExpenses.length === 1 ? "" : "s"} cadastrada${fixedExpenses.length === 1 ? "" : "s"}` : "Nenhuma despesa fixa cadastrada"} hint={fixedExpenses.length === 0 ? "Sem aluguel, luz, funcionário etc. o lucro líquido não desconta nada. Mais abaixo." : undefined} />
          {noOrderCosts && <HealthItem ok={false} info title="Embalagem e motoboy em R$ 0" hint="Tudo bem se você não gasta com isso. Se usa embalagem ou paga motoboy, configura mais abaixo — senão o lucro aparece maior do que é." />}
          {allRatesZero && <HealthItem ok={false} info title="Taxas de pagamento em 0%" hint="Tudo bem se você não paga taxa. Se usa maquininha de cartão, configura mais abaixo." />}
        </ul>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <PeriodCard title="Hoje" summary={today} />
        <PeriodCard title="Essa semana" summary={week} />
        <PeriodCard title="Esse mês" summary={month} fixedTotal={fixedTotal} purchasesTotal={monthPurchasesTotal} />
      </div>

      <BreakEvenCard be={be} bruto={month.bruto} />

      <Card eyebrow="Formas de pagamento" title="Quanto entrou em cada uma neste mês">
        {month.orders === 0 ? <p className="mt-4 rounded-xl border border-white/10 p-4 text-sm text-white/50">Sem pedidos no mês ainda.</p> : <PaymentTable rows={payments} />}
      </Card>

      <Card eyebrow="Qual prato dá mais lucro" title="Lucro por prato (neste mês)">
        <p className="mt-1.5 text-sm text-white/50">Preço de venda menos o custo atual dos ingredientes (pela ficha técnica de hoje), vezes o que vendeu no mês. <span className="hidden md:inline">Clica no título de uma coluna pra ordenar. </span>Margem abaixo de 30% pede atenção — talvez o preço precise subir.</p>
        <DishSheet rows={withRecipe} withoutRecipe={withoutRecipe} />
      </Card>

      <Card eyebrow="Despesas fixas" title="Aluguel, luz, funcionário...">
        <p className="mt-1.5 text-sm text-white/50">O que sai todo mês, vendendo ou não. Clica no nome ou no valor pra editar (Enter salva). O valor de cada mês fica guardado pra comparar com o mês passado.</p>
        <section aria-label="Adicionar despesa fixa" className="mt-4 rounded-xl border-2 border-sky-500 bg-sky-50 p-3 text-slate-800 shadow-md shadow-sky-900/20 sm:p-4">
          <h4 className="flex items-center gap-2 text-sm font-extrabold text-sky-900"><span className="grid h-6 w-6 place-items-center rounded-full bg-sky-600 text-base leading-none text-white">＋</span> Adicionar despesa fixa</h4>
          <div className="mt-3 grid gap-3 md:grid-cols-[1.5fr_1fr_auto] md:items-end">
            <div>
              <label htmlFor="new-expense-name" className="block text-[11px] font-extrabold uppercase tracking-wide text-slate-700">Despesa <span className="text-red-600">*</span></label>
              <input id="new-expense-name" type="text" value={newExpenseName} onChange={(event) => { setNewExpenseName(event.target.value); setAddExpenseError(null); }} onKeyDown={(event) => { if (event.key === "Enter") handleAddExpense(); }} placeholder="ex: Aluguel, Luz, Funcionário" className={sheetInput} />
            </div>
            <div>
              <label htmlFor="new-expense-amount" className="block text-[11px] font-extrabold uppercase tracking-wide text-slate-700">Valor por mês (R$) <span className="text-red-600">*</span></label>
              <input id="new-expense-amount" type="text" inputMode="decimal" value={newExpenseAmount} onChange={(event) => { setNewExpenseAmount(event.target.value); setAddExpenseError(null); }} onKeyDown={(event) => { if (event.key === "Enter") handleAddExpense(); }} placeholder="ex: 1500,00" className={sheetInput} />
            </div>
            <button type="button" onClick={handleAddExpense} disabled={addingExpense || !newExpenseName.trim()} className="min-h-[44px] rounded-md bg-sky-600 px-5 py-2 text-sm font-extrabold text-white shadow hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-40">{addingExpense ? "Adicionando…" : "＋ Adicionar despesa"}</button>
          </div>
          {addExpenseError && <p role="alert" className="mt-2 rounded bg-red-100 px-3 py-2 text-xs font-semibold text-red-700">{addExpenseError}</p>}
        </section>

        <div className="mt-4 overflow-hidden rounded-md border border-slate-300 bg-white text-[13px] text-slate-800 shadow-sm">
          <div className="hidden bg-slate-100 text-[11px] font-bold uppercase tracking-wide text-slate-600 md:flex">
            <div className="flex-1 px-3 py-2">Despesa</div><div className="w-44 border-l border-slate-300 px-3 py-2 text-right">Valor por mês</div><div className="w-40 border-l border-slate-300 px-3 py-2 text-right">Mês passado</div><div className="w-14 border-l border-slate-300 px-3 py-2" />
          </div>
          {fixedExpenses.length === 0 ? (
            <p className="px-3 py-6 text-center text-slate-500">Nenhuma despesa fixa ainda. Preenche o quadro azul acima.</p>
          ) : fixedExpenses.map((expense) => {
            const previous = lastMonthAmount(expense.id, fixedExpenseHistory, monthStart);
            return (
              <div key={expense.id} className="flex flex-wrap items-stretch border-t border-slate-300 first:border-t-0 md:flex-nowrap md:first:border-t">
                <div className="w-full flex-1 font-semibold"><EditableCell text={expense.name} onCommit={(raw) => saveExpenseName(expense, raw)} /></div>
                <div className="w-1/2 border-slate-300 md:w-44 md:border-l"><EditableCell numeric align="right" text={toDraft(expense.amount)} display={money(expense.amount)} onCommit={(raw) => saveExpenseAmount(expense, raw)} /></div>
                <div className="flex w-1/2 items-center justify-end border-l border-slate-300 px-3 text-xs tabular-nums text-slate-500 md:w-40">{previous !== null ? money(previous) : <span className="text-slate-300" title="Ainda não tem registro de antes deste mês">sem registro</span>}</div>
                <div className="flex w-full items-center justify-end border-t border-slate-200 md:w-14 md:justify-center md:border-l md:border-t-0"><button type="button" onClick={() => handleDeleteExpense(expense)} aria-label={`Apagar ${expense.name}`} className="min-h-[44px] min-w-[44px] rounded text-[15px] text-red-500 hover:bg-red-50 md:min-h-0 md:min-w-0 md:px-2 md:py-1">🗑</button></div>
              </div>
            );
          })}
          {fixedExpenses.length > 0 && <div className="flex justify-between border-t-2 border-slate-300 bg-slate-100 px-3 py-2 text-[13px] font-extrabold"><span>Total por mês</span><span className="tabular-nums">{money(fixedTotal)}</span></div>}
        </div>
      </Card>

      <PaymentFeesEditor key={JSON.stringify(paymentFeeRates)} rates={paymentFeeRates} onSave={onSetPaymentFeeRates} onSaved={showToast} />

      <OrderCostsEditor key={JSON.stringify(orderCostRates)} rates={orderCostRates} monthOrders={month.orders} monthDeliveries={month.entregas} avgDeliveryFee={month.entregas > 0 && month.taxaEntrega > 0 ? month.taxaEntrega / month.entregas : null} onSave={onSetOrderCostRates} onSaved={showToast} />

      {toast && <div role="status" className="fixed bottom-5 right-5 z-50 max-w-[90vw] rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-bold text-white shadow-lg shadow-emerald-500/20">✓ {toast}</div>}
    </div>
  );
}

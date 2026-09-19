import { useEffect, useRef, useState } from "react";
import { isPurchasePriceUnusual, type Ingredient } from "./ingredients";
import { SAVE_FAILED, UNIT_LABELS, escapeHtml, formatMoney, formatNumber, formatUnitCost, parseNumber, toDraft, withTimeout } from "./stockFormat";

type Reason = "esgotado" | "abaixo";
type Item = { ingredient: Ingredient; reason: Reason; suggested: number | null };
type Group = { category: string; items: Item[] };

const NO_CATEGORY = "Sem categoria";
const compareText = (a: string, b: string): number => a.localeCompare(b, "pt-BR", { sensitivity: "base" });

/** Tudo que está esgotado OU abaixo do mínimo entra na lista. A quantidade sugerida (quando dá pra saber) é a que falta pra voltar ao mínimo. */
function buildItems(ingredients: Ingredient[]): Item[] {
  return ingredients.flatMap((ingredient): Item[] => {
    const below = ingredient.minStock !== null && ingredient.stock < ingredient.minStock;
    if (ingredient.stock > 0 && !below) return [];
    const suggested = ingredient.minStock !== null && below ? Math.round((ingredient.minStock - Math.max(0, ingredient.stock)) * 1000) / 1000 : null;
    return [{ ingredient, reason: ingredient.stock <= 0 ? "esgotado" : "abaixo", suggested }];
  });
}

/** Agrupa por categoria (bom pra ir de corredor em corredor no mercado); esgotado vem antes dentro de cada grupo. */
function groupByCategory(items: Item[]): Group[] {
  const map = new Map<string, Item[]>();
  items.forEach((item) => {
    const key = item.ingredient.category?.trim() || NO_CATEGORY;
    map.set(key, [...(map.get(key) ?? []), item]);
  });
  return Array.from(map.entries())
    .sort(([a], [b]) => (a === NO_CATEGORY ? 1 : b === NO_CATEGORY ? -1 : compareText(a, b)))
    .map(([category, list]) => ({ category, items: list.sort((a, b) => (a.reason === b.reason ? compareText(a.ingredient.name, b.ingredient.name) : a.reason === "esgotado" ? -1 : 1)) }));
}

const unitOf = (ingredient: Ingredient): string => UNIT_LABELS[ingredient.unit] ?? ingredient.unit;

function shareLine(item: Item, quantity: number): string {
  const { ingredient } = item;
  const detail = item.reason === "abaixo" ? ` (tem ${formatNumber(ingredient.stock)}, mínimo ${formatNumber(ingredient.minStock ?? 0)})` : "";
  if (quantity > 0) return `- ${ingredient.name}: comprar ${formatNumber(quantity)} ${unitOf(ingredient)}${item.reason === "esgotado" ? " (ESGOTADO)" : detail}`;
  return `- ${ingredient.name}: ${item.reason === "esgotado" ? "ESGOTADO — " : ""}quantidade a definir`;
}

export default function ShoppingList({ ingredients, onRegisterPurchase }: { ingredients: Ingredient[]; onRegisterPurchase: (ingredientId: string, quantity: number, totalCost: number) => Promise<void> }) {
  const [drafts, setDrafts] = useState<Record<string, { qty?: string; total?: string }>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (flashTimerRef.current) clearTimeout(flashTimerRef.current); }, []);
  const showFlash = (message: string) => {
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    setFlash(message);
    flashTimerRef.current = setTimeout(() => setFlash(null), 2500);
  };

  const items = buildItems(ingredients);
  const groups = groupByCategory(items);
  const qtyText = (item: Item): string => drafts[item.ingredient.id]?.qty ?? (item.suggested !== null ? toDraft(item.suggested) : "");
  const qtyOf = (item: Item): number => { const value = parseNumber(qtyText(item)); return Number.isFinite(value) && value > 0 ? value : 0; };

  const estimatedTotal = items.reduce((sum, item) => sum + (item.ingredient.avgCost > 0 ? qtyOf(item) * item.ingredient.avgCost : 0), 0);
  const withoutPrice = items.filter((item) => qtyOf(item) === 0 || item.ingredient.avgCost <= 0).length;
  const anyMinimum = ingredients.some((ingredient) => ingredient.minStock !== null);

  const handleRegister = (item: Item) => {
    const { ingredient } = item;
    const quantity = qtyOf(item);
    const totalCost = parseNumber(drafts[ingredient.id]?.total ?? "");
    if (!(quantity > 0) || !(totalCost > 0)) { window.alert("Preenche quanto veio (quantidade) e quanto pagou no total pra registrar a compra."); return; }
    const unitCost = totalCost / quantity;
    if (isPurchasePriceUnusual(unitCost, ingredient.avgCost) && !window.confirm(`Esse valor (${formatUnitCost(unitCost)} por ${unitOf(ingredient)}) tá bem diferente do custo médio atual (${formatUnitCost(ingredient.avgCost)}). Confirma mesmo assim?`)) return;
    setSavingId(ingredient.id);
    withTimeout(onRegisterPurchase(ingredient.id, quantity, totalCost))
      .then(() => { setDrafts((current) => { const next = { ...current }; delete next[ingredient.id]; return next; }); showFlash(`Compra de ${ingredient.name} registrada: +${formatNumber(quantity)} ${unitOf(ingredient)}`); })
      .catch(() => window.alert(SAVE_FAILED))
      .finally(() => setSavingId(null));
  };

  const shareOnWhatsApp = () => {
    const lines = ["🛒 *Lista de compras* — Sooba", new Date().toLocaleDateString("pt-BR")];
    groups.forEach((group) => { lines.push("", `*${group.category}*`, ...group.items.map((item) => shareLine(item, qtyOf(item)))); });
    // Sem número fixo de propósito: quem manda escolhe o contato ou grupo na hora.
    window.open(`https://wa.me/?text=${encodeURIComponent(lines.join("\n"))}`, "_blank", "noopener,noreferrer");
  };

  const printList = () => {
    const rows = groups.map((group) => `<tr><th colspan="4" class="cat">${escapeHtml(group.category)}</th></tr>${group.items.map((item) => `<tr><td class="box">☐</td><td>${escapeHtml(item.ingredient.name)}${item.reason === "esgotado" ? " <b>(ESGOTADO)</b>" : ""}</td><td>${qtyOf(item) > 0 ? `${formatNumber(qtyOf(item))} ${unitOf(item.ingredient)}` : "____"}</td><td>tem ${formatNumber(item.ingredient.stock)}</td></tr>`).join("")}`).join("");
    const html = `<!doctype html><html><head><title>Lista de compras</title><meta charset="utf-8"><style>body{font-family:sans-serif;padding:20px} table{width:100%;border-collapse:collapse} td,th{border:1px solid #ccc;padding:7px 10px;text-align:left;font-size:14px} .cat{background:#eee;text-transform:uppercase;font-size:12px} .box{width:28px;text-align:center;font-size:18px}</style></head><body><h2>Lista de compras — ${new Date().toLocaleDateString("pt-BR")}</h2><table><tbody>${rows}</tbody></table></body></html>`;
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  };

  const toolbarButton = "min-h-[40px] rounded-full border border-white/15 px-3.5 py-2 text-xs font-bold text-white/70 transition hover:border-white/35 hover:text-white md:min-h-0";
  const inputClass = "mt-1 min-h-[44px] w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-[16px] text-slate-900 outline-none focus:border-sky-500 sm:w-28 md:min-h-0 md:text-[13px]";

  return (
    <div className="rounded-2xl border border-white/10 bg-[#171211] p-4 sm:p-6">
      <p className="text-xs font-bold uppercase tracking-[.18em] text-[#ff7c50]">🛒 Lista de compras</p>
      <h3 className="mt-1 font-display text-xl font-extrabold tracking-[-.03em]">O que comprar agora</h3>
      <p className="mt-1.5 text-sm text-white/55">Entra aqui tudo que está <strong className="text-white/80">esgotado</strong> ou <strong className="text-white/80">abaixo do mínimo</strong>, agrupado por categoria. Comprou? Preenche quanto veio e quanto pagou e clica em <strong className="text-white/80">Registrar compra</strong> — o estoque e o custo médio atualizam sozinhos e o item sai da lista.</p>

      {items.length === 0 ? (
        <div className="mt-4 rounded-xl border border-emerald-400/25 bg-emerald-400/10 px-4 py-5 text-sm text-emerald-200">
          {ingredients.length === 0 ? "Cadastra os ingredientes na tabela acima pra a lista de compras começar a funcionar." : <>✅ <strong>Tudo em dia!</strong> Nenhum ingrediente esgotado ou abaixo do mínimo.{!anyMinimum && <span className="mt-1 block text-emerald-200/70">Dica: defina o estoque mínimo dos ingredientes na tabela acima — assim a lista avisa antes de acabar.</span>}</>}
        </div>
      ) : (
        <>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-amber-400/15 px-3 py-1.5 text-xs font-bold text-amber-300">⚠️ {items.length} {items.length === 1 ? "item" : "itens"} pra comprar</span>
            {estimatedTotal > 0 && <span className="rounded-full bg-white/[0.07] px-3 py-1.5 text-xs font-bold text-white/70" title="Quantidade a comprar × custo médio atual">≈ {formatMoney(estimatedTotal)} estimado{withoutPrice > 0 ? ` (${withoutPrice} sem preço/quantidade)` : ""}</span>}
            <span className="flex-1" />
            <button type="button" onClick={shareOnWhatsApp} className={toolbarButton}>📤 Compartilhar no WhatsApp</button>
            <button type="button" onClick={printList} className={toolbarButton}>🖨️ Imprimir</button>
          </div>

          <div className="mt-3 overflow-hidden rounded-md border border-slate-300 bg-white text-[13px] text-slate-800 shadow-sm">
            {groups.map((group) => (
              <section key={group.category}>
                <h4 className="border-b border-slate-300 bg-slate-100 px-3 py-1.5 text-[11px] font-extrabold uppercase tracking-wide text-slate-600">{group.category} <span className="font-semibold text-slate-400">· {group.items.length}</span></h4>
                {group.items.map((item) => {
                  const { ingredient } = item;
                  const quantity = qtyOf(item);
                  const estimate = quantity > 0 && ingredient.avgCost > 0 ? quantity * ingredient.avgCost : null;
                  return (
                    <div key={ingredient.id} className={`border-b border-slate-300 px-3 py-3 last:border-b-0 ${item.reason === "esgotado" ? "bg-red-50" : "bg-amber-50"}`}>
                      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[14px] font-bold">{ingredient.name}</span>
                          <span className={`rounded px-2 py-0.5 text-[11px] font-bold ${item.reason === "esgotado" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-800"}`}>{item.reason === "esgotado" ? "Esgotado" : "Esgotando"}</span>
                        </div>
                        <span className="text-[12px] text-slate-600">tem {formatNumber(Math.max(0, ingredient.stock))} {unitOf(ingredient)} · {ingredient.minStock !== null ? `mínimo ${formatNumber(ingredient.minStock)} ${unitOf(ingredient)}` : "sem mínimo definido"}</span>
                      </div>
                      <div className="mt-2 flex flex-wrap items-end gap-2">
                        <div className="min-w-[120px] flex-1 sm:flex-none">
                          <label htmlFor={`shop-qty-${ingredient.id}`} className="block text-[11px] font-bold uppercase text-slate-500">Comprar ({unitOf(ingredient)})</label>
                          <input id={`shop-qty-${ingredient.id}`} type="text" inputMode="decimal" value={qtyText(item)} onChange={(event) => setDrafts((current) => ({ ...current, [ingredient.id]: { ...current[ingredient.id], qty: event.target.value } }))} placeholder={item.suggested === null ? "quanto?" : ""} className={inputClass} />
                        </div>
                        <div className="min-w-[120px] flex-1 sm:flex-none">
                          <label htmlFor={`shop-total-${ingredient.id}`} className="block text-[11px] font-bold uppercase text-slate-500">Paguei no total (R$)</label>
                          <input id={`shop-total-${ingredient.id}`} type="text" inputMode="decimal" value={drafts[ingredient.id]?.total ?? ""} onChange={(event) => setDrafts((current) => ({ ...current, [ingredient.id]: { ...current[ingredient.id], total: event.target.value } }))} onKeyDown={(event) => { if (event.key === "Enter") handleRegister(item); }} placeholder="ex: 250,00" className={inputClass} />
                        </div>
                        <button type="button" onClick={() => handleRegister(item)} disabled={savingId === ingredient.id} className="min-h-[44px] w-full rounded bg-sky-600 px-3.5 py-2 text-sm font-bold text-white hover:bg-sky-700 disabled:cursor-wait disabled:opacity-60 sm:w-auto md:min-h-0 md:text-xs">{savingId === ingredient.id ? "Salvando…" : "✓ Registrar compra"}</button>
                        {estimate !== null ? <span className="pb-2 text-xs text-slate-600">≈ {formatMoney(estimate)}</span> : quantity > 0 ? <span className="pb-2 text-xs text-slate-400">sem preço de compra ainda</span> : item.suggested === null ? <span className="pb-2 text-xs text-slate-500">defina o mínimo na tabela pra eu sugerir a quantidade</span> : null}
                      </div>
                    </div>
                  );
                })}
              </section>
            ))}
          </div>
        </>
      )}

      {flash && <div role="status" className="fixed bottom-5 right-5 z-50 max-w-[90vw] rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-bold text-white shadow-lg shadow-emerald-500/20">✓ {flash}</div>}
    </div>
  );
}

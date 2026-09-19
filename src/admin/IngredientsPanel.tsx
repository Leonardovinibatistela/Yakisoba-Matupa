import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { isPurchasePriceUnusual, type Ingredient, type IngredientPurchase, type IngredientUnit } from "./ingredients";
import type { Recipes } from "./recipes";

const UNIT_LABELS: Record<IngredientUnit, string> = { kg: "kg", g: "g", l: "litros", ml: "ml", un: "unidades" };
const UNIT_OPTIONS: { value: IngredientUnit; label: string }[] = [
  { value: "kg", label: "kg (quilo)" },
  { value: "g", label: "g (grama)" },
  { value: "l", label: "litros" },
  { value: "ml", label: "ml" },
  { value: "un", label: "unidades" },
];

type Status = { label: string; badge: string; row: string };
function statusOf(ingredient: Ingredient): Status | null {
  if (ingredient.stock <= 0) return { label: "Esgotado", badge: "bg-red-100 text-red-700", row: "bg-red-50" };
  if (ingredient.minStock !== null && ingredient.stock < ingredient.minStock) return { label: "Esgotando", badge: "bg-amber-100 text-amber-800", row: "bg-amber-50" };
  return null;
}

const parseNumber = (raw: string): number => Number(raw.trim().replace(",", "."));
const formatNumber = (value: number): string => value.toLocaleString("pt-BR", { maximumFractionDigits: 3 });
const toDraft = (value: number): string => String(Math.round(value * 1000) / 1000).replace(".", ",");
const formatMoney = (value: number): string => `R$ ${value.toFixed(2).replace(".", ",")}`;
// Custo por grama/ml é centavos (ex.: R$ 0,0325) — com 2 casas arredondaria pra R$ 0,03 e esconderia a diferença.
const formatUnitCost = (value: number): string => `R$ ${value.toFixed(value >= 1 ? 2 : value >= 0.1 ? 3 : 4).replace(".", ",")}`;
const normalize = (value: string): string => value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const escapeHtml = (value: string): string => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Se o Firebase demorar demais (internet ruim), a célula avisa em vez de ficar esperando pra sempre.
const withTimeout = <T,>(promise: Promise<T>, ms = 15000): Promise<T> => Promise.race([promise, new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), ms))]);
const SAVE_FAILED = "Não salvou — confere a internet e tenta de novo.";

/**
 * Célula editável estilo planilha: clica (ou Enter) pra editar, Enter ou
 * clicar fora salva, Esc cancela. onCommit devolve um texto de erro (a
 * célula continua aberta, em vermelho) ou null se salvou.
 */
function EditableCell({ text, display, align = "left", numeric = false, placeholder = "—", listId, onCommit }: { text: string; display?: ReactNode; align?: "left" | "right"; numeric?: boolean; placeholder?: string; listId?: string; onCommit: (raw: string) => Promise<string | null> }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(text);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState(false);
  const editingRef = useRef(false);
  const busyRef = useRef(false);
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (flashTimerRef.current) clearTimeout(flashTimerRef.current); }, []);

  const start = () => { setDraft(text); setError(null); editingRef.current = true; setEditing(true); };
  const cancel = () => { editingRef.current = false; setEditing(false); setError(null); };
  const commit = async () => {
    if (!editingRef.current || busyRef.current) return;
    if (draft.trim() === text.trim()) { cancel(); return; }
    busyRef.current = true;
    const problem = await onCommit(draft);
    busyRef.current = false;
    if (problem) { setError(problem); return; }
    editingRef.current = false;
    setEditing(false);
    setError(null);
    setFlash(true);
    flashTimerRef.current = setTimeout(() => setFlash(false), 1000);
  };

  const alignClass = align === "right" ? "text-right" : "text-left";
  if (!editing) {
    return (
      <div tabIndex={0} role="button" onClick={start} onKeyDown={(event) => { if (event.key === "Enter" || event.key === "F2") { event.preventDefault(); start(); } }} className={`min-h-[44px] cursor-cell px-2 py-[12px] outline-none transition-colors md:min-h-[34px] md:py-[7px] hover:bg-sky-100 focus:ring-2 focus:ring-inset focus:ring-sky-400 ${alignClass} ${flash ? "bg-emerald-200" : ""}`}>
        {display ?? (text || <span className="text-slate-300">{placeholder}</span>)}
      </div>
    );
  }
  return (
    <div>
      <input autoFocus type="text" inputMode={numeric ? "decimal" : undefined} list={listId} value={draft} onChange={(event) => setDraft(event.target.value)} onFocus={(event) => event.currentTarget.select()} onBlur={commit}
        onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); event.currentTarget.blur(); } else if (event.key === "Escape") { cancel(); } }}
        className={`min-h-[44px] w-full border-2 px-2 py-1 text-[16px] text-slate-900 outline-none md:min-h-[34px] md:text-[13px] ${alignClass} ${error ? "border-red-500 bg-red-50" : "border-sky-500 bg-white"}`} />
      {error && <div className="px-2 pb-1 text-[10px] font-semibold leading-tight text-red-600">{error}</div>}
    </div>
  );
}

function PurchaseHistoryRow({ purchase, unit, onEdit, onDelete }: { purchase: IngredientPurchase; unit: IngredientUnit; onEdit: (newQuantity: number, newTotalCost: number) => Promise<void>; onDelete: () => Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const [quantityDraft, setQuantityDraft] = useState(String(purchase.quantity));
  const [totalCostDraft, setTotalCostDraft] = useState(String(purchase.totalCost));
  const [saving, setSaving] = useState(false);
  const inputClass = "w-24 rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-900 outline-none focus:border-sky-500";

  if (editing) {
    return (
      <div className="flex flex-wrap items-center gap-2 py-1.5">
        <input type="text" inputMode="decimal" value={quantityDraft} onChange={(event) => setQuantityDraft(event.target.value)} className={inputClass} />
        <input type="text" inputMode="decimal" value={totalCostDraft} onChange={(event) => setTotalCostDraft(event.target.value)} className={inputClass} />
        <button type="button" disabled={saving} onClick={() => { const q = parseNumber(quantityDraft); const c = parseNumber(totalCostDraft); if (!q || q <= 0 || !c || c <= 0) return; setSaving(true); onEdit(q, c).then(() => setEditing(false)).finally(() => setSaving(false)); }} className="rounded bg-sky-600 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-sky-700 disabled:opacity-50">{saving ? "…" : "Salvar"}</button>
        <button type="button" onClick={() => setEditing(false)} className="text-[11px] font-bold text-slate-500 hover:text-slate-800">Cancelar</button>
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-3 py-1.5 text-xs text-slate-600">
      <span className="w-20">{purchase.createdAt.toLocaleDateString("pt-BR")}</span>
      <span>{formatNumber(purchase.quantity)} {UNIT_LABELS[unit]} por {formatMoney(purchase.totalCost)}</span>
      <button type="button" onClick={() => setEditing(true)} className="text-[11px] font-bold text-sky-700 underline hover:text-sky-900">Corrigir</button>
      <button type="button" onClick={() => { if (window.confirm("Apagar essa compra? O custo médio recalcula sozinho com o que sobrar.")) onDelete(); }} className="text-[11px] font-bold text-red-600 hover:text-red-800">Apagar</button>
    </div>
  );
}

const exportToExcel = (items: Ingredient[]) => {
  const header = ["Ingrediente", "Categoria", "Unidade", "Estoque", "Custo medio (R$)", "Minimo", "Status"];
  const rows = items.map((item) => [item.name, item.category ?? "", UNIT_LABELS[item.unit], formatNumber(item.stock), String(Math.round(item.avgCost * 10000) / 10000).replace(".", ","), item.minStock !== null ? formatNumber(item.minStock) : "", statusOf(item)?.label ?? "OK"]);
  const csv = [header, ...rows].map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(";")).join("\r\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `estoque-sooba-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
};

const printTable = (items: Ingredient[]) => {
  const rows = items.map((item) => `<tr><td>${escapeHtml(item.name)}</td><td>${escapeHtml(item.category ?? "-")}</td><td>${UNIT_LABELS[item.unit]}</td><td>${formatNumber(item.stock)}</td><td>${formatUnitCost(item.avgCost)}</td><td>${item.minStock !== null ? formatNumber(item.minStock) : "-"}</td><td>${statusOf(item)?.label ?? "OK"}</td></tr>`).join("");
  const html = `<!doctype html><html><head><title>Estoque</title><meta charset="utf-8"><style>body{font-family:sans-serif;padding:20px} table{width:100%;border-collapse:collapse} th,td{border:1px solid #ccc;padding:6px 10px;text-align:left;font-size:13px} th{background:#f0f0f0}</style></head><body><h2>Estoque — ${new Date().toLocaleDateString("pt-BR")}</h2><table><thead><tr><th>Ingrediente</th><th>Categoria</th><th>Unidade</th><th>Estoque</th><th>Custo médio</th><th>Mínimo</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table></body></html>`;
  const printWindow = window.open("", "_blank");
  if (!printWindow) return;
  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.focus();
  printWindow.print();
};

type SortKey = "name" | "category" | "stock" | "avgCost" | "minStock" | "status";
const statusRank = (ingredient: Ingredient): number => (ingredient.stock <= 0 ? 0 : ingredient.minStock !== null && ingredient.stock < ingredient.minStock ? 1 : 2);
const compareText = (a: string, b: string): number => a.localeCompare(b, "pt-BR", { sensitivity: "base" });

const HEADERS: { key: SortKey; label: string; align: "left" | "right"; hint?: string }[] = [
  { key: "name", label: "Ingrediente", align: "left" },
  { key: "category", label: "Categoria", align: "left" },
  { key: "stock", label: "Estoque", align: "right", hint: "Clica numa célula pra corrigir a quantidade (contagem, perda, quebra). Pra registrar uma compra, usa o botão ＋ Compra." },
  { key: "avgCost", label: "Custo médio", align: "right", hint: "Calculado sozinho a partir das compras registradas." },
  { key: "minStock", label: "Mínimo", align: "right", hint: "Abaixo disso o ingrediente entra na lista de compras." },
  { key: "status", label: "Situação", align: "left" },
];

// Celular (menos de 768px) mostra cartões em vez da tabela larga.
function useIsMobile(): boolean {
  const query = "(max-width: 767px)";
  const [matches, setMatches] = useState(() => typeof window !== "undefined" && window.matchMedia(query).matches);
  useEffect(() => {
    const media = window.matchMedia(query);
    const update = () => setMatches(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  return matches;
}

export default function IngredientsPanel({ ingredients, ingredientPurchases, recipes, onAddIngredient, onRenameIngredient, onRegisterPurchase, onAdjustStock, onSetMinStock, onSetCategory, onDeleteIngredient, onEditPurchase, onDeletePurchase }: { ingredients: Ingredient[]; ingredientPurchases: IngredientPurchase[]; recipes: Recipes; onAddIngredient: (name: string, unit: IngredientUnit, category: string | null) => Promise<string>; onRenameIngredient: (ingredientId: string, name: string) => Promise<void>; onRegisterPurchase: (ingredientId: string, quantity: number, totalCost: number) => Promise<void>; onAdjustStock: (ingredientId: string, newStock: number) => Promise<void>; onSetMinStock: (ingredientId: string, minStock: number | null) => Promise<void>; onSetCategory: (ingredientId: string, category: string | null) => Promise<void>; onDeleteIngredient: (ingredientId: string) => Promise<void>; onEditPurchase: (purchase: IngredientPurchase, newQuantity: number, newTotalCost: number) => Promise<void>; onDeletePurchase: (purchase: IngredientPurchase) => Promise<void> }) {
  const [newName, setNewName] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [newUnit, setNewUnit] = useState<IngredientUnit>("kg");
  const [addingIngredient, setAddingIngredient] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [purchaseOpenId, setPurchaseOpenId] = useState<string | null>(null);
  const [purchaseDrafts, setPurchaseDrafts] = useState<Record<string, { quantity: string; totalCost: string }>>({});
  const [savingPurchaseId, setSavingPurchaseId] = useState<string | null>(null);
  const [deletingIngredientId, setDeletingIngredientId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "name", dir: 1 });
  const [fullscreen, setFullscreen] = useState(false);
  const isMobile = useIsMobile();
  const [flashMessage, setFlashMessage] = useState<string | null>(null);
  const flashTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current); }, []);

  // Tela cheia = a tabela cobre a janela toda (funciona também no celular). Esc sai, a não ser que esteja digitando numa célula.
  useEffect(() => {
    if (!fullscreen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !(event.target instanceof HTMLInputElement) && !(event.target instanceof HTMLSelectElement)) setFullscreen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => { document.body.style.overflow = previousOverflow; window.removeEventListener("keydown", onKeyDown); };
  }, [fullscreen]);

  const showFlash = (message: string) => {
    if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current);
    setFlashMessage(message);
    flashTimeoutRef.current = setTimeout(() => setFlashMessage(null), 2500);
  };

  const query = normalize(searchQuery.trim());
  const visibleIngredients = ingredients
    .filter((ingredient) => query === "" || normalize(ingredient.name).includes(query) || (ingredient.category !== null && normalize(ingredient.category).includes(query)))
    .sort((a, b) => {
      let result = 0;
      if (sort.key === "name") result = compareText(a.name, b.name);
      else if (sort.key === "category") result = compareText(a.category ?? "￿", b.category ?? "￿");
      else if (sort.key === "stock") result = a.stock - b.stock;
      else if (sort.key === "avgCost") result = a.avgCost - b.avgCost;
      else if (sort.key === "minStock") result = (a.minStock ?? Infinity) - (b.minStock ?? Infinity);
      else result = statusRank(a) - statusRank(b);
      if (Number.isNaN(result) || result === 0) return compareText(a.name, b.name);
      return result * sort.dir;
    });
  const categories = Array.from(new Set(ingredients.map((ingredient) => ingredient.category).filter((category): category is string => !!category))).sort(compareText);

  const toggleSort = (key: SortKey) => setSort((current) => (current.key === key ? { key, dir: current.dir === 1 ? -1 : 1 } : { key, dir: 1 }));

  const nameTaken = (name: string, exceptId?: string) => ingredients.some((other) => other.id !== exceptId && normalize(other.name) === normalize(name));

  const handleAddIngredient = () => {
    const name = newName.trim();
    if (!name || addingIngredient) return;
    if (nameTaken(name)) { setAddError(`Já existe um ingrediente chamado "${name}". Procura ele na tabela e clica na célula pra editar.`); return; }
    setAddError(null);
    setAddingIngredient(true);
    withTimeout(onAddIngredient(name, newUnit, newCategory.trim() || null))
      .then(() => { setNewName(""); setNewCategory(""); showFlash(`Ingrediente "${name}" adicionado — agora preenche estoque e mínimo na linha dele`); })
      .catch(() => setAddError(SAVE_FAILED))
      .finally(() => setAddingIngredient(false));
  };

  const saveName = async (ingredient: Ingredient, raw: string): Promise<string | null> => {
    const name = raw.trim();
    if (!name) return "O nome não pode ficar vazio.";
    if (nameTaken(name, ingredient.id)) return `Já existe "${name}".`;
    try { await withTimeout(onRenameIngredient(ingredient.id, name)); showFlash(`Nome salvo: ${name}`); return null; } catch { return SAVE_FAILED; }
  };
  const saveCategory = async (ingredient: Ingredient, raw: string): Promise<string | null> => {
    try { await withTimeout(onSetCategory(ingredient.id, raw.trim() || null)); showFlash(`Categoria de ${ingredient.name} salva`); return null; } catch { return SAVE_FAILED; }
  };
  const saveStock = async (ingredient: Ingredient, raw: string): Promise<string | null> => {
    const value = parseNumber(raw);
    if (raw.trim() === "" || Number.isNaN(value) || value < 0) return "Digite um número (0 ou mais).";
    try { await withTimeout(onAdjustStock(ingredient.id, value)); showFlash(`Estoque de ${ingredient.name}: ${formatNumber(value)} ${UNIT_LABELS[ingredient.unit]}`); return null; } catch { return SAVE_FAILED; }
  };
  const saveMinStock = async (ingredient: Ingredient, raw: string): Promise<string | null> => {
    const value = raw.trim() === "" ? null : parseNumber(raw);
    if (value !== null && (Number.isNaN(value) || value < 0)) return "Digite um número (0 ou mais), ou deixe vazio pra tirar o mínimo.";
    try { await withTimeout(onSetMinStock(ingredient.id, value)); showFlash(value === null ? `Mínimo de ${ingredient.name} removido` : `Mínimo de ${ingredient.name}: ${formatNumber(value)} ${UNIT_LABELS[ingredient.unit]}`); return null; } catch { return SAVE_FAILED; }
  };

  const handleSavePurchase = (ingredient: Ingredient) => {
    const draft = purchaseDrafts[ingredient.id] ?? { quantity: "", totalCost: "" };
    const quantity = parseNumber(draft.quantity);
    const totalCost = parseNumber(draft.totalCost);
    if (!quantity || quantity <= 0 || !totalCost || totalCost <= 0) return;
    const unitCost = totalCost / quantity;
    if (isPurchasePriceUnusual(unitCost, ingredient.avgCost)) {
      const confirmed = window.confirm(`Esse valor (${formatUnitCost(unitCost)} por ${UNIT_LABELS[ingredient.unit]}) tá bem diferente do custo médio atual (${formatUnitCost(ingredient.avgCost)}). Confirma mesmo assim?`);
      if (!confirmed) return;
    }
    setSavingPurchaseId(ingredient.id);
    withTimeout(onRegisterPurchase(ingredient.id, quantity, totalCost))
      .then(() => { setPurchaseDrafts((current) => ({ ...current, [ingredient.id]: { quantity: "", totalCost: "" } })); showFlash(`Compra de ${ingredient.name} registrada: +${formatNumber(quantity)} ${UNIT_LABELS[ingredient.unit]}`); })
      .catch(() => window.alert(SAVE_FAILED))
      .finally(() => setSavingPurchaseId(null));
  };

  const handleDeleteIngredient = (ingredient: Ingredient) => {
    const usedIn = Object.values(recipes).filter((rows) => rows.some((row) => row.ingredientId === ingredient.id)).length;
    const usage = usedIn > 0 ? `\n\nAtenção: ele é usado em ${usedIn} ficha${usedIn === 1 ? "" : "s"} técnica${usedIn === 1 ? "" : "s"}. Nelas ele passa a aparecer como removido, e o custo do prato fica incompleto até você trocar.` : "";
    if (!window.confirm(`Apagar o ingrediente "${ingredient.name}"? Isso não pode ser desfeito. O histórico de compras dele continua guardado.${usage}`)) return;
    setDeletingIngredientId(ingredient.id);
    withTimeout(onDeleteIngredient(ingredient.id))
      .then(() => { if (purchaseOpenId === ingredient.id) setPurchaseOpenId(null); showFlash(`Ingrediente "${ingredient.name}" apagado`); })
      .catch(() => window.alert(SAVE_FAILED))
      .finally(() => setDeletingIngredientId(null));
  };

  const outOfStockCount = ingredients.filter((ingredient) => ingredient.stock <= 0).length;
  const lowStockCount = ingredients.filter((ingredient) => ingredient.stock > 0 && ingredient.minStock !== null && ingredient.stock < ingredient.minStock).length;
  const cellClass = "border border-slate-300 p-0";

  const statusBadge = (status: Status | null) => (status ? <span className={`rounded px-2 py-0.5 text-[11px] font-bold ${status.badge}`}>{status.label}</span> : <span className="text-[11px] font-semibold text-emerald-700">OK</span>);
  const costLabel = (ingredient: Ingredient) => (ingredient.avgCost > 0 ? `${formatUnitCost(ingredient.avgCost)} /${ingredient.unit}` : <span className="text-slate-300" title="Ainda sem compra registrada">sem compra</span>);
  const stockCell = (ingredient: Ingredient, align: "left" | "right") => <EditableCell numeric align={align} text={toDraft(ingredient.stock)} display={<>{formatNumber(ingredient.stock)} <span className="text-[11px] text-slate-400">{UNIT_LABELS[ingredient.unit]}</span></>} onCommit={(raw) => saveStock(ingredient, raw)} />;
  const minCell = (ingredient: Ingredient, align: "left" | "right") => <EditableCell numeric align={align} placeholder="sem mínimo" text={ingredient.minStock !== null ? toDraft(ingredient.minStock) : ""} display={ingredient.minStock !== null ? <>{formatNumber(ingredient.minStock)} <span className="text-[11px] text-slate-400">{UNIT_LABELS[ingredient.unit]}</span></> : undefined} onCommit={(raw) => saveMinStock(ingredient, raw)} />;
  const deleteButton = (ingredient: Ingredient, className: string) => <button type="button" onClick={() => handleDeleteIngredient(ingredient)} disabled={deletingIngredientId === ingredient.id} title="Apagar ingrediente" aria-label={`Apagar ${ingredient.name}`} className={`rounded text-[15px] text-red-500 hover:bg-red-50 disabled:opacity-40 ${className}`}>🗑</button>;
  const purchaseButton = (ingredient: Ingredient, history: IngredientPurchase[], className: string) => {
    const isOpen = purchaseOpenId === ingredient.id;
    return <button type="button" onClick={() => setPurchaseOpenId(isOpen ? null : ingredient.id)} aria-expanded={isOpen} className={`rounded border text-[12px] font-bold ${isOpen ? "border-sky-600 bg-sky-600 text-white" : "border-sky-600 text-sky-700 hover:bg-sky-50"} ${className}`}>＋ Compra{history.length > 0 ? ` (${history.length})` : ""}</button>;
  };

  const renderPurchasePanel = (ingredient: Ingredient, history: IngredientPurchase[]) => {
    const draft = purchaseDrafts[ingredient.id] ?? { quantity: "", totalCost: "" };
    const draftQuantity = parseNumber(draft.quantity);
    const draftTotal = parseNumber(draft.totalCost);
    const inputClass = "mt-1 w-full min-h-[44px] rounded border border-slate-300 bg-white px-2 py-1.5 text-[16px] text-slate-900 outline-none focus:border-sky-500 md:min-h-0 md:w-28 md:text-[13px]";
    return (
      <>
        <p className="text-xs font-bold text-slate-700">Registrar compra de {ingredient.name}</p>
        <div className="mt-2 grid grid-cols-2 items-end gap-3 md:flex md:flex-wrap">
          <div>
            <label htmlFor={`buy-qty-${ingredient.id}`} className="block text-[11px] font-bold uppercase text-slate-500">Comprei ({UNIT_LABELS[ingredient.unit]})</label>
            <input id={`buy-qty-${ingredient.id}`} type="text" inputMode="decimal" value={draft.quantity} onChange={(event) => setPurchaseDrafts((current) => ({ ...current, [ingredient.id]: { ...draft, quantity: event.target.value } }))} onKeyDown={(event) => { if (event.key === "Enter") handleSavePurchase(ingredient); }} placeholder="ex: 5" className={inputClass} />
          </div>
          <div>
            <label htmlFor={`buy-total-${ingredient.id}`} className="block text-[11px] font-bold uppercase text-slate-500">Paguei no total (R$)</label>
            <input id={`buy-total-${ingredient.id}`} type="text" inputMode="decimal" value={draft.totalCost} onChange={(event) => setPurchaseDrafts((current) => ({ ...current, [ingredient.id]: { ...draft, totalCost: event.target.value } }))} onKeyDown={(event) => { if (event.key === "Enter") handleSavePurchase(ingredient); }} placeholder="ex: 250,00" className={inputClass} />
          </div>
          <button type="button" onClick={() => handleSavePurchase(ingredient)} disabled={savingPurchaseId === ingredient.id} className="col-span-2 min-h-[44px] rounded bg-sky-600 px-3.5 py-2 text-sm font-bold text-white hover:bg-sky-700 disabled:cursor-wait disabled:opacity-60 md:col-auto md:min-h-0 md:text-xs">{savingPurchaseId === ingredient.id ? "Salvando…" : "Registrar compra"}</button>
          {draftQuantity > 0 && draftTotal > 0 && <span className="col-span-2 text-xs text-slate-600 md:col-auto md:pb-2">= {formatUnitCost(draftTotal / draftQuantity)} por {ingredient.unit}</span>}
        </div>
        <p className="mt-2 text-[11px] text-slate-500">Lança na mesma unidade da nota fiscal — caixa com 50 unidades, lança 50 (não 1 pelo preço da caixa).</p>
        {history.length > 0 && (
          <div className="mt-3">
            <p className="text-[11px] font-bold uppercase text-slate-500">Compras anteriores</p>
            <div className="mt-1 max-h-44 divide-y divide-slate-200 overflow-auto rounded border border-slate-200 bg-white px-3">
              {history.map((purchase) => <PurchaseHistoryRow key={purchase.id} purchase={purchase} unit={ingredient.unit} onEdit={(newQuantity, newTotalCost) => onEditPurchase(purchase, newQuantity, newTotalCost)} onDelete={() => onDeletePurchase(purchase)} />)}
            </div>
          </div>
        )}
      </>
    );
  };

  const addForm = (
    <section aria-label="Adicionar novo ingrediente" className="mt-5 rounded-xl border-2 border-sky-500 bg-sky-50 p-3 text-slate-800 shadow-md shadow-sky-900/20 sm:p-4">
      <h3 className="flex items-center gap-2 text-sm font-extrabold text-sky-900"><span className="grid h-6 w-6 place-items-center rounded-full bg-sky-600 text-base leading-none text-white">＋</span> Adicionar novo ingrediente</h3>
      <div className="mt-3 grid gap-3 md:grid-cols-[1.5fr_1fr_auto_auto] md:items-end">
        <div>
          <label htmlFor="new-ingredient-name" className="block text-[11px] font-extrabold uppercase tracking-wide text-slate-700">Novo ingrediente <span className="text-red-600">*</span></label>
          <input id="new-ingredient-name" type="text" value={newName} onChange={(event) => { setNewName(event.target.value); setAddError(null); }} onKeyDown={(event) => { if (event.key === "Enter") handleAddIngredient(); }} placeholder="Nome, ex: Salmão ou Coca-Cola 300 ml" className="mt-1 min-h-[44px] w-full rounded-md border-2 border-slate-300 bg-white px-3 py-2 text-[16px] text-slate-900 outline-none placeholder:text-slate-400 focus:border-sky-600 md:text-[14px]" />
        </div>
        <div>
          <label htmlFor="new-ingredient-category" className="block text-[11px] font-extrabold uppercase tracking-wide text-slate-700">Categoria <span className="font-semibold normal-case text-slate-500">(opcional)</span></label>
          <input id="new-ingredient-category" type="text" list="ingredient-categories" value={newCategory} onChange={(event) => setNewCategory(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") handleAddIngredient(); }} placeholder="ex: Carnes, Bebidas" className="mt-1 min-h-[44px] w-full rounded-md border-2 border-slate-300 bg-white px-3 py-2 text-[16px] text-slate-900 outline-none placeholder:text-slate-400 focus:border-sky-600 md:text-[14px]" />
        </div>
        <div>
          <label htmlFor="new-ingredient-unit" className="block text-[11px] font-extrabold uppercase tracking-wide text-slate-700">Medido em</label>
          <select id="new-ingredient-unit" value={newUnit} onChange={(event) => setNewUnit(event.target.value as IngredientUnit)} className="mt-1 min-h-[44px] w-full rounded-md border-2 border-slate-300 bg-white px-2 text-[16px] text-slate-900 outline-none focus:border-sky-600 md:text-[14px]">
            {UNIT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </div>
        <button type="button" onClick={handleAddIngredient} disabled={addingIngredient || !newName.trim()} className="min-h-[44px] rounded-md bg-sky-600 px-5 py-2 text-sm font-extrabold text-white shadow hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-40">{addingIngredient ? "Adicionando…" : "＋ Adicionar ingrediente"}</button>
      </div>
      {addError && <p role="alert" className="mt-2 rounded bg-red-100 px-3 py-2 text-xs font-semibold text-red-700">{addError}</p>}
      <p className="mt-2 text-[11px] text-slate-600">Depois de adicionar, ele aparece na tabela abaixo — é só clicar nas células dele pra preencher o estoque e o mínimo.</p>
    </section>
  );

  const emptyMessage = ingredients.length === 0 ? "Nenhum ingrediente ainda. Preenche o quadro azul acima e clica em ＋ Adicionar ingrediente." : visibleIngredients.length === 0 ? `Nenhum ingrediente encontrado pra "${searchQuery.trim()}".` : null;

  const mobileCards = (
    <div className="space-y-2">
      {emptyMessage && <p className="rounded-md border border-slate-300 bg-white px-3 py-6 text-center text-sm text-slate-500">{emptyMessage}</p>}
      {visibleIngredients.map((ingredient) => {
        const status = statusOf(ingredient);
        const isOpen = purchaseOpenId === ingredient.id;
        const history = ingredientPurchases.filter((purchase) => purchase.ingredientId === ingredient.id);
        const label = "px-2 pt-1 text-[10px] font-bold uppercase text-slate-500";
        return (
          <div key={ingredient.id} className={`overflow-hidden rounded-md border border-slate-300 text-[14px] text-slate-800 ${status?.row ?? "bg-white"}`}>
            <div className="flex items-center justify-between gap-2 border-b border-slate-200">
              <div className="min-w-0 flex-1 font-bold"><EditableCell text={ingredient.name} onCommit={(raw) => saveName(ingredient, raw)} /></div>
              <div className="shrink-0 pr-2">{statusBadge(status)}</div>
            </div>
            <div className="grid grid-cols-2 divide-x divide-slate-200 border-b border-slate-200">
              <div><p className={label}>Estoque</p>{stockCell(ingredient, "left")}</div>
              <div><p className={label}>Mínimo</p>{minCell(ingredient, "left")}</div>
            </div>
            <div className="grid grid-cols-2 divide-x divide-slate-200 border-b border-slate-200">
              <div><p className={label}>Categoria</p><EditableCell text={ingredient.category ?? ""} listId="ingredient-categories" onCommit={(raw) => saveCategory(ingredient, raw)} /></div>
              <div><p className={label}>Custo médio</p><div className="px-2 py-[10px] tabular-nums text-slate-700">{costLabel(ingredient)}</div></div>
            </div>
            <div className="flex items-center gap-2 p-2">
              {purchaseButton(ingredient, history, "min-h-[44px] flex-1 px-3")}
              {deleteButton(ingredient, "min-h-[44px] min-w-[44px]")}
            </div>
            {isOpen && <div className="border-t border-slate-300 bg-sky-50 px-3 py-3">{renderPurchasePanel(ingredient, history)}</div>}
          </div>
        );
      })}
    </div>
  );

  const desktopTable = (
    <div className={`${fullscreen ? "min-h-0 flex-1" : "max-h-[70vh]"} overflow-auto rounded-md border border-slate-300 bg-white text-[13px] text-slate-800 shadow-sm`}>
      <table className="w-full min-w-[820px] table-fixed border-collapse">
        <colgroup><col style={{ width: "24%" }} /><col style={{ width: "15%" }} /><col style={{ width: "13%" }} /><col style={{ width: "14%" }} /><col style={{ width: "12%" }} /><col style={{ width: "10%" }} /><col style={{ width: "12%" }} /></colgroup>
        <thead className="sticky top-0 z-10">
          <tr>
            {HEADERS.map((header) => (
              <th key={header.key} title={header.hint} onClick={() => toggleSort(header.key)} className={`cursor-pointer select-none border border-slate-300 bg-slate-100 px-2 py-2 text-[11px] font-bold uppercase tracking-wide text-slate-600 hover:bg-slate-200 ${header.align === "right" ? "text-right" : "text-left"}`}>
                {header.label} <span className="text-slate-400">{sort.key === header.key ? (sort.dir === 1 ? "▲" : "▼") : ""}</span>
              </th>
            ))}
            <th className="border border-slate-300 bg-slate-100 px-2 py-2 text-left text-[11px] font-bold uppercase tracking-wide text-slate-600">Ações</th>
          </tr>
        </thead>
        <tbody>
          {emptyMessage && <tr><td colSpan={7} className="border border-slate-300 px-3 py-6 text-center text-slate-500">{emptyMessage}</td></tr>}

          {visibleIngredients.map((ingredient) => {
            const status = statusOf(ingredient);
            const isOpen = purchaseOpenId === ingredient.id;
            const history = ingredientPurchases.filter((purchase) => purchase.ingredientId === ingredient.id);
            return (
              <Fragment key={ingredient.id}>
                <tr className={status?.row ?? ""}>
                  <td className={`${cellClass} font-semibold`}><EditableCell text={ingredient.name} onCommit={(raw) => saveName(ingredient, raw)} /></td>
                  <td className={cellClass}><EditableCell text={ingredient.category ?? ""} listId="ingredient-categories" onCommit={(raw) => saveCategory(ingredient, raw)} /></td>
                  <td className={cellClass}>{stockCell(ingredient, "right")}</td>
                  <td className={`${cellClass} px-2 text-right tabular-nums text-slate-600`}>{costLabel(ingredient)}</td>
                  <td className={cellClass}>{minCell(ingredient, "right")}</td>
                  <td className={`${cellClass} px-2`}>{statusBadge(status)}</td>
                  <td className={`${cellClass} whitespace-nowrap px-1.5 py-1`}>
                    {purchaseButton(ingredient, history, "px-2 py-1")}
                    {deleteButton(ingredient, "ml-1 px-1.5 py-1")}
                  </td>
                </tr>
                {isOpen && (
                  <tr>
                    <td colSpan={7} className="border border-slate-300 bg-sky-50 px-4 py-3">{renderPurchasePanel(ingredient, history)}</td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  const toolbarButton = "min-h-[40px] rounded-full border border-white/15 px-3.5 py-2 text-xs font-bold text-white/70 transition hover:border-white/35 hover:text-white disabled:cursor-not-allowed disabled:opacity-40 md:min-h-0";

  return (
    <div className={fullscreen ? "fixed inset-0 z-[60] flex flex-col overflow-hidden bg-[#171211] p-3 sm:p-5" : "mt-10 rounded-2xl border border-white/10 bg-[#171211] p-4 sm:p-6"}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-[.18em] text-[#ff7c50]">🧂 Ingredientes e Estoque</p>
          <h2 className="mt-1 font-display text-xl font-extrabold tracking-[-.03em]">Tabela do estoque</h2>
        </div>
        {fullscreen && <button type="button" onClick={() => setFullscreen(false)} className={`shrink-0 ${toolbarButton}`}>✕ Sair da tela cheia</button>}
      </div>
      {!fullscreen && <p className="mt-1.5 text-sm text-white/55">Funciona igual planilha: <strong className="text-white/80">{isMobile ? "toca numa célula" : "clica numa célula"} pra editar</strong> — {isMobile ? "confirma no teclado" : "Enter salva, Esc cancela"}, e aparece um aviso verde quando salvou. Comprou ingrediente? Usa o botão <strong className="text-white/80">＋ Compra</strong> (ele soma no estoque e atualiza o custo médio sozinho).</p>}

      {(outOfStockCount > 0 || lowStockCount > 0) && (
        <div className="mt-3 flex flex-wrap gap-2">
          {outOfStockCount > 0 && <span className="rounded-full bg-red-500/15 px-3 py-1.5 text-xs font-bold text-red-400">🔴 {outOfStockCount} ingrediente{outOfStockCount === 1 ? "" : "s"} esgotado{outOfStockCount === 1 ? "" : "s"}</span>}
          {lowStockCount > 0 && <span className="rounded-full bg-amber-400/15 px-3 py-1.5 text-xs font-bold text-amber-300">🟡 {lowStockCount} esgotando</span>}
        </div>
      )}

      {addForm}

      <div className="mt-5 flex flex-wrap items-end gap-2">
        <div className="min-w-0 basis-full sm:basis-0 sm:flex-1">
          <label htmlFor="ingredient-search" className="text-[10px] font-bold uppercase tracking-[.14em] text-white/45">Buscar</label>
          <input id="ingredient-search" type="text" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Nome ou categoria, ex: salmão, carnes…" className="mt-1.5 min-h-[44px] w-full rounded-lg border border-white/15 bg-white/[0.06] px-3 py-2 text-[16px] text-white outline-none focus:border-[#ff6b32] sm:min-h-0 sm:text-sm" />
        </div>
        {isMobile && (
          <select aria-label="Ordenar por" value={sort.key} onChange={(event) => setSort({ key: event.target.value as SortKey, dir: 1 })} className="min-h-[40px] rounded-full border border-white/15 bg-[#171211] px-3 text-xs font-bold text-white/70 outline-none">
            {HEADERS.map((header) => <option key={header.key} value={header.key}>Ordenar: {header.label}</option>)}
          </select>
        )}
        {!fullscreen && <button type="button" onClick={() => setFullscreen(true)} className={toolbarButton}>⛶ Tela cheia</button>}
        <button type="button" onClick={() => exportToExcel(visibleIngredients)} disabled={visibleIngredients.length === 0} className={toolbarButton}>📊 Exportar Excel</button>
        <button type="button" onClick={() => printTable(visibleIngredients)} disabled={visibleIngredients.length === 0} className={toolbarButton}>🖨️ Imprimir</button>
      </div>

      <datalist id="ingredient-categories">{categories.map((category) => <option key={category} value={category} />)}</datalist>

      <div className={`mt-4 ${fullscreen ? "flex min-h-0 flex-1 flex-col overflow-auto" : ""}`}>{isMobile ? mobileCards : desktopTable}</div>

      {flashMessage && <div role="status" className="fixed bottom-5 right-5 z-[70] max-w-[90vw] rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-bold text-white shadow-lg shadow-emerald-500/20">✓ {flashMessage}</div>}
    </div>
  );
}

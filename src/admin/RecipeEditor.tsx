import { useEffect, useRef, useState } from "react";
import type { Ingredient, IngredientUnit } from "./ingredients";
import type { RecipeIngredient, Recipes } from "./recipes";

// keepQuantity: linha cujo ingrediente não foi achado (apagado, ou a lista ainda não carregou) — a quantidade original é mantida como está em vez de sumir da ficha.
type Row = { key: number; ingredientId: string; text: string; inputUnit: string; keepQuantity?: number };
type SaveStatus = "idle" | "pending" | "saving" | "saved" | "error";

const UNIT_OPTIONS: { value: IngredientUnit; label: string }[] = [
  { value: "kg", label: "kg (quilo)" },
  { value: "g", label: "g (grama)" },
  { value: "l", label: "litros" },
  { value: "ml", label: "ml" },
  { value: "un", label: "unidades" },
];

// Ingrediente cadastrado em kg/litro dá pra lançar em g/ml (o que a cozinha realmente usa) — a ficha guarda sempre na unidade do ingrediente.
const inputUnitsFor = (unit: IngredientUnit): { label: string; factor: number }[] => {
  if (unit === "kg") return [{ label: "g", factor: 0.001 }, { label: "kg", factor: 1 }];
  if (unit === "l") return [{ label: "ml", factor: 0.001 }, { label: "l", factor: 1 }];
  return [{ label: unit, factor: 1 }];
};

const parseNumber = (raw: string): number => Number(raw.trim().replace(",", "."));
const toText = (value: number): string => String(Math.round(value * 1000) / 1000).replace(".", ",");
const formatMoney = (value: number): string => `R$ ${value.toFixed(2).replace(".", ",")}`;
const normalize = (value: string): string => value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const byName = (a: Ingredient, b: Ingredient): number => a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" });
const withTimeout = <T,>(promise: Promise<T>, ms = 15000): Promise<T> => Promise.race([promise, new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), ms))]);

export default function RecipeEditor({ itemId, itemName, ingredients, recipe, recipes, itemCatalog, onSave, onCreateIngredient }: { itemId: string; itemName: string; ingredients: Ingredient[]; recipe: RecipeIngredient[]; recipes: Recipes; itemCatalog: { id: string; name: string; price: number }[]; onSave: (itemId: string, ingredients: RecipeIngredient[]) => Promise<void>; onCreateIngredient: (name: string, unit: IngredientUnit, category: string | null) => Promise<string> }) {
  const keyCounter = useRef(0);
  const [createdIngredients, setCreatedIngredients] = useState<Record<string, Ingredient>>({});
  const lookup = (id: string): Ingredient | undefined => ingredients.find((candidate) => candidate.id === id) ?? createdIngredients[id];

  const rowsFromRecipe = (source: RecipeIngredient[]): Row[] => source.map((entry) => {
    const ingredient = ingredients.find((candidate) => candidate.id === entry.ingredientId);
    if (!ingredient) return { key: keyCounter.current++, ingredientId: entry.ingredientId, text: "", inputUnit: "", keepQuantity: entry.quantity };
    const small = ingredient && (ingredient.unit === "kg" || ingredient.unit === "l") && entry.quantity < 1;
    if (small) return { key: keyCounter.current++, ingredientId: entry.ingredientId, text: toText(entry.quantity * 1000), inputUnit: ingredient.unit === "kg" ? "g" : "ml" };
    return { key: keyCounter.current++, ingredientId: entry.ingredientId, text: toText(entry.quantity), inputUnit: ingredient ? inputUnitsFor(ingredient.unit).slice(-1)[0].label : "" };
  });

  const [rows, setRows] = useState<Row[]>(() => rowsFromRecipe(recipe));
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [justAddedKey, setJustAddedKey] = useState<number | null>(null);
  const [pickText, setPickText] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [newUnit, setNewUnit] = useState<IngredientUnit>("kg");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [copyFromId, setCopyFromId] = useState("");

  const dirtyRef = useRef(false);
  const baselineRef = useRef<string | null>(null);
  const latestRef = useRef<{ complete: RecipeIngredient[]; signature: string }>({ complete: [], signature: "" });

  const quantityOf = (row: Row): number => {
    const ingredient = lookup(row.ingredientId);
    if (!ingredient) return row.keepQuantity ?? 0;
    const amount = parseNumber(row.text);
    if (!Number.isFinite(amount) || amount <= 0) return 0;
    const option = inputUnitsFor(ingredient.unit).find((candidate) => candidate.label === row.inputUnit) ?? inputUnitsFor(ingredient.unit)[0];
    return Math.round(amount * option.factor * 1e6) / 1e6;
  };
  const completeOf = (list: Row[]): RecipeIngredient[] => list.filter((row) => quantityOf(row) > 0).map((row) => ({ ingredientId: row.ingredientId, quantity: quantityOf(row) }));
  const complete = completeOf(rows);
  const signature = JSON.stringify(complete);
  if (baselineRef.current === null) baselineRef.current = signature;
  latestRef.current = { complete, signature };
  const removedCount = rows.filter((row) => !lookup(row.ingredientId)).length;
  const incompleteCount = rows.filter((row) => lookup(row.ingredientId) && quantityOf(row) <= 0).length;

  // Se a ficha chegar do Firebase depois de aberta (ainda sem mexer em nada), mostra ela em vez de uma tabela vazia.
  const recipeSignature = JSON.stringify(recipe);
  const firstRunRef = useRef(true);
  useEffect(() => {
    if (firstRunRef.current) { firstRunRef.current = false; return; }
    if (!dirtyRef.current) {
      const nextRows = rowsFromRecipe(recipe);
      setRows(nextRows);
      baselineRef.current = JSON.stringify(completeOf(nextRows));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recipeSignature, ingredients.length]);

  const save = async (toSave: RecipeIngredient[], sig: string) => {
    setStatus("saving");
    try {
      await withTimeout(onSave(itemId, toSave));
      baselineRef.current = sig;
      setStatus("saved");
    } catch {
      setStatus("error");
    }
  };

  // Salva sozinho ~0,7s depois da última mudança (só as linhas completas).
  useEffect(() => {
    if (signature === baselineRef.current) return;
    setStatus("pending");
    const timer = setTimeout(() => save(complete, signature), 700);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  // Fechou a ficha antes dos 0,7s? Salva na hora, pra não perder a última mudança.
  useEffect(() => () => {
    const { complete: pending, signature: sig } = latestRef.current;
    if (baselineRef.current !== null && sig !== baselineRef.current) onSave(itemId, pending).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const touch = () => { dirtyRef.current = true; };
  const updateRow = (key: number, next: Partial<Row>) => { touch(); setRows((current) => current.map((row) => (row.key === key ? { ...row, ...next } : row))); };
  const removeRow = (key: number) => { touch(); setRows((current) => current.filter((row) => row.key !== key)); };
  const addRowFor = (ingredient: Ingredient) => {
    touch();
    const key = keyCounter.current++;
    setRows((current) => [...current, { key, ingredientId: ingredient.id, text: "", inputUnit: inputUnitsFor(ingredient.unit)[0].label }]);
    setJustAddedKey(key);
    setPickText("");
    setPickerOpen(false);
    setCreateError(null);
  };

  const usedIds = new Set(rows.map((row) => row.ingredientId));
  const query = normalize(pickText);
  const matches = ingredients.filter((ingredient) => !usedIds.has(ingredient.id) && (query === "" || normalize(ingredient.name).includes(query))).sort(byName);
  const exactExisting = query === "" ? undefined : ingredients.find((ingredient) => normalize(ingredient.name) === query);
  const showCreate = query !== "" && !exactExisting;

  const handleCreate = () => {
    const name = pickText.trim();
    if (!name || creating) return;
    setCreating(true);
    setCreateError(null);
    withTimeout(onCreateIngredient(name, newUnit, null))
      .then((id) => {
        const created: Ingredient = { id, name, unit: newUnit, stock: 0, avgCost: 0, minStock: null, category: null };
        setCreatedIngredients((current) => ({ ...current, [id]: created }));
        addRowFor(created);
      })
      .catch(() => setCreateError("Não consegui criar — confere a internet e tenta de novo."))
      .finally(() => setCreating(false));
  };

  const copySources = itemCatalog.filter((candidate) => candidate.id !== itemId && (recipes[candidate.id]?.length ?? 0) > 0);
  const handleCopy = () => {
    const source = recipes[copyFromId];
    if (!source || source.length === 0) return;
    if (rows.length > 0 && !window.confirm("Copiar troca a ficha atual pela do outro prato. Continua?")) return;
    touch();
    setRows(rowsFromRecipe(source));
    setCopyFromId("");
  };

  const totalCost = rows.reduce((sum, row) => sum + quantityOf(row) * (lookup(row.ingredientId)?.avgCost ?? 0), 0);
  const missingCostNames = rows.filter((row) => quantityOf(row) > 0 && (lookup(row.ingredientId)?.avgCost ?? 0) <= 0).map((row) => lookup(row.ingredientId)?.name ?? "ingrediente removido");
  const price = itemCatalog.find((candidate) => candidate.id === itemId)?.price ?? 0;
  const margin = price > 0 && totalCost > 0 ? ((price - totalCost) / price) * 100 : null;

  const statusText = status === "saving" || status === "pending" ? "Salvando…" : status === "saved" ? "✓ Salvo" : status === "error" ? "⚠ Não salvou" : complete.length > 0 ? "✓ Salvo" : "";
  const inputClass = "min-h-[44px] rounded border border-slate-300 bg-white px-2 py-1 text-[16px] text-slate-900 outline-none focus:border-sky-500 sm:min-h-[32px] sm:text-[13px]";

  return (
    <div className="mt-2 rounded-lg border border-slate-300 bg-white p-3 text-[13px] text-slate-800 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Ficha técnica — {itemName}</p>
        <span role="status" className={`text-[11px] font-bold ${status === "error" ? "text-red-600" : status === "saved" || status === "idle" ? "text-emerald-700" : "text-slate-500"}`}>
          {statusText}
          {status === "error" && <button type="button" onClick={() => save(complete, signature)} className="ml-2 underline">tentar de novo</button>}
        </span>
      </div>
      <p className="mt-1 text-[11px] leading-relaxed text-slate-500">Quanto de cada ingrediente vai em <strong>uma</strong> unidade deste item. Salva sozinho. Use a quantidade <strong>bruta</strong> (antes de limpar): se 1 kg de cebola rende 850 g limpa e o prato usa 100 g limpa, lance ~118 g.</p>

      <div className="mt-2 border border-slate-300">
        <div className="hidden bg-slate-100 text-[11px] font-bold uppercase tracking-wide text-slate-600 sm:flex">
          <div className="w-[38%] px-2 py-1.5">Ingrediente</div>
          <div className="w-[30%] border-l border-slate-300 px-2 py-1.5">Quantidade</div>
          <div className="w-[24%] border-l border-slate-300 px-2 py-1.5 text-right">Custo</div>
          <div className="w-[8%] border-l border-slate-300 px-2 py-1.5" />
        </div>
        {rows.map((row) => {
          const ingredient = lookup(row.ingredientId);
          const options = ingredient ? inputUnitsFor(ingredient.unit) : [];
          const quantity = quantityOf(row);
          const cost = ingredient ? quantity * ingredient.avgCost : 0;
          const needsQuantity = ingredient !== undefined && quantity <= 0;
          return (
            <div key={row.key} className={`flex flex-wrap items-center border-t border-slate-300 first:border-t-0 sm:first:border-t ${!ingredient ? "bg-red-50" : needsQuantity ? "bg-amber-50" : ""}`}>
              <div className="w-full px-2 pt-2 font-semibold sm:w-[38%] sm:py-1.5">
                {ingredient ? ingredient.name : <span className="text-red-700">Ingrediente removido — remova esta linha ou adicione outro</span>}
              </div>
              <div className="flex flex-1 items-center gap-1.5 px-2 py-1.5 sm:w-[30%] sm:flex-none sm:self-stretch sm:border-l sm:border-slate-300">
                {ingredient && (
                  <>
                    <input type="text" inputMode="decimal" autoFocus={row.key === justAddedKey} value={row.text} onChange={(event) => updateRow(row.key, { text: event.target.value })} placeholder="quanto?" aria-label={`Quantidade de ${ingredient.name}`} className={`w-24 text-right ${inputClass} ${needsQuantity ? "border-amber-500" : ""}`} />
                    {options.length > 1 ? (
                      <select value={row.inputUnit} onChange={(event) => updateRow(row.key, { inputUnit: event.target.value })} aria-label={`Unidade de ${ingredient.name}`} className={inputClass}>
                        {options.map((option) => <option key={option.label} value={option.label}>{option.label}</option>)}
                      </select>
                    ) : <span className="text-slate-500">{options[0]?.label}</span>}
                  </>
                )}
              </div>
              <div className="px-2 text-right tabular-nums sm:w-[24%] sm:self-stretch sm:border-l sm:border-slate-300 sm:py-1.5">
                {!ingredient || quantity <= 0 ? <span className="text-amber-700">{needsQuantity ? "falta a quantidade" : ""}</span>
                  : ingredient.avgCost > 0 ? formatMoney(cost) : <span className="text-amber-700" title="Registre a compra desse ingrediente na aba Estoque pra o custo aparecer">sem compra</span>}
              </div>
              <div className="px-1 sm:w-[8%] sm:self-stretch sm:border-l sm:border-slate-300 sm:py-1 sm:text-center"><button type="button" onClick={() => removeRow(row.key)} aria-label="Remover linha" className="min-h-[44px] min-w-[44px] rounded text-sm font-bold text-red-500 hover:bg-red-50 sm:min-h-0 sm:min-w-0 sm:px-1.5 sm:py-0.5">✕</button></div>
            </div>
          );
        })}
      </div>
      <div className="border border-t-0 border-slate-300 bg-sky-50 p-2" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setPickerOpen(false); }}>
                <input type="text" value={pickText} onChange={(event) => { setPickText(event.target.value); setPickerOpen(true); setCreateError(null); }} onFocus={() => setPickerOpen(true)}
                  onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); if (exactExisting && !usedIds.has(exactExisting.id)) addRowFor(exactExisting); else if (matches.length === 1) addRowFor(matches[0]); else if (matches.length === 0 && showCreate) handleCreate(); } }}
                  placeholder="＋ Digite o nome do ingrediente" aria-label="Adicionar ingrediente à ficha" className={`w-full ${inputClass}`} />
                {pickerOpen && (matches.length > 0 || showCreate) && (
                  <div className="mt-1.5 max-h-56 overflow-auto rounded border border-slate-300 bg-white shadow-sm" onMouseDown={(event) => { if (!(event.target instanceof HTMLSelectElement || event.target instanceof HTMLOptionElement)) event.preventDefault(); }}>
                    {matches.map((ingredient) => (
                      <button key={ingredient.id} type="button" onClick={() => addRowFor(ingredient)} className="flex min-h-[44px] w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-[14px] hover:bg-sky-50 sm:min-h-0 sm:text-[13px]">
                        <span className="font-semibold">{ingredient.name}</span><span className="text-[11px] text-slate-400">{ingredient.unit}{ingredient.category ? ` · ${ingredient.category}` : ""}</span>
                      </button>
                    ))}
                    {exactExisting && usedIds.has(exactExisting.id) && <p className="px-3 py-1.5 text-[11px] text-slate-500">"{exactExisting.name}" já está nesta ficha.</p>}
                    {showCreate && (
                      <div className="flex flex-wrap items-center gap-2 border-t border-slate-200 bg-slate-50 px-3 py-2">
                        <span className="text-[12px] text-slate-600">Não existe "{pickText.trim()}". Criar novo, medido em</span>
                        <select value={newUnit} onChange={(event) => setNewUnit(event.target.value as IngredientUnit)} className={inputClass}>
                          {UNIT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                        </select>
                        <button type="button" onClick={handleCreate} disabled={creating} className="min-h-[44px] rounded bg-sky-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-sky-700 disabled:opacity-60 sm:min-h-0">{creating ? "Criando…" : "＋ Criar e adicionar"}</button>
                      </div>
                    )}
                  </div>
                )}
                {createError && <p className="mt-1 text-[11px] font-semibold text-red-600">{createError}</p>}
              </div>

      {incompleteCount > 0 && <p className="mt-2 rounded bg-amber-50 px-2 py-1.5 text-[11px] font-semibold text-amber-800">{incompleteCount === 1 ? "1 linha ainda não vale" : `${incompleteCount} linhas ainda não valem`} (falta a quantidade) — só as linhas com quantidade são salvas.</p>}
      {removedCount > 0 && <p className="mt-2 rounded bg-red-50 px-2 py-1.5 text-[11px] font-semibold text-red-700">{removedCount === 1 ? "1 linha tem" : `${removedCount} linhas têm`} ingrediente removido. Ela continua na ficha como estava, e o custo do prato fica incompleto até você adicionar outro ingrediente no lugar e tirar essa linha (✕).</p>}

      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-slate-200 pt-2 text-[12px]">
        <span>Custo desta ficha: <strong className="tabular-nums">{formatMoney(totalCost)}</strong>{missingCostNames.length > 0 && <span className="text-amber-700"> (parcial: falta registrar a compra de {missingCostNames.join(", ")})</span>}</span>
        {price > 0 && <span>Preço de venda: <strong className="tabular-nums">{formatMoney(price)}</strong></span>}
        {margin !== null && <span>Margem: <strong className={margin < 30 ? "text-red-600" : "text-emerald-700"}>{margin.toFixed(0)}%</strong></span>}
      </div>

      {copySources.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-slate-200 pt-2 text-[12px]">
          <label htmlFor={`copy-from-${itemId}`} className="text-slate-500">Copiar a ficha de outro prato:</label>
          <select id={`copy-from-${itemId}`} value={copyFromId} onChange={(event) => setCopyFromId(event.target.value)} className={`max-w-[60%] ${inputClass}`}>
            <option value="">escolha…</option>
            {copySources.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}
          </select>
          <button type="button" onClick={handleCopy} disabled={!copyFromId} className="rounded border border-sky-600 px-2.5 py-1 text-xs font-bold text-sky-700 hover:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-40">Copiar</button>
        </div>
      )}
    </div>
  );
}

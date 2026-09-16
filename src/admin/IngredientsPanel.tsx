import { useState } from "react";
import { isPurchasePriceUnusual, type Ingredient, type IngredientPurchase, type IngredientUnit } from "./ingredients";

const UNIT_LABELS: Record<IngredientUnit, string> = { kg: "kg", l: "litros", un: "unidades" };

function PurchaseHistoryRow({ purchase, unit, onEdit, onDelete }: { purchase: IngredientPurchase; unit: IngredientUnit; onEdit: (newQuantity: number, newTotalCost: number) => Promise<void>; onDelete: () => Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const [quantityDraft, setQuantityDraft] = useState(String(purchase.quantity));
  const [totalCostDraft, setTotalCostDraft] = useState(String(purchase.totalCost));
  const [saving, setSaving] = useState(false);

  if (editing) {
    return (
      <div className="flex flex-wrap items-center gap-2 py-2">
        <input type="text" inputMode="decimal" value={quantityDraft} onChange={(event) => setQuantityDraft(event.target.value)} className="w-24 rounded-lg border border-white/15 bg-white/[0.06] px-2.5 py-1.5 text-xs text-white outline-none focus:border-[#ff6b32]" />
        <input type="text" inputMode="decimal" value={totalCostDraft} onChange={(event) => setTotalCostDraft(event.target.value)} className="w-24 rounded-lg border border-white/15 bg-white/[0.06] px-2.5 py-1.5 text-xs text-white outline-none focus:border-[#ff6b32]" />
        <button type="button" disabled={saving} onClick={() => { const q = Number(quantityDraft.replace(",", ".")); const c = Number(totalCostDraft.replace(",", ".")); if (!q || q <= 0 || !c || c <= 0) return; setSaving(true); onEdit(q, c).then(() => setEditing(false)).finally(() => setSaving(false)); }} className="rounded-full border border-white/15 px-3 py-1 text-[11px] font-bold text-white/70 transition hover:border-white/35 hover:text-white disabled:opacity-50">{saving ? "…" : "Salvar"}</button>
        <button type="button" onClick={() => setEditing(false)} className="text-[11px] font-bold text-white/40 hover:text-white">Cancelar</button>
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-2 py-2 text-xs text-white/60">
      <span>{purchase.createdAt.toLocaleDateString("pt-BR")}</span>
      <span>{purchase.quantity.toLocaleString("pt-BR")} {UNIT_LABELS[unit]} por R${purchase.totalCost.toFixed(2)}</span>
      <button type="button" onClick={() => setEditing(true)} className="text-[11px] font-bold text-[#ff875c] underline decoration-dotted underline-offset-2 hover:text-white">Editar</button>
      <button type="button" onClick={() => { if (window.confirm("Apagar essa compra? O custo médio recalcula sozinho com o que sobrar.")) onDelete(); }} className="text-[11px] font-bold text-red-400/80 hover:text-red-300">🗑</button>
    </div>
  );
}

export default function IngredientsPanel({ ingredients, ingredientPurchases, onAddIngredient, onRegisterPurchase, onAdjustStock, onSetMinStock, onEditPurchase, onDeletePurchase }: { ingredients: Ingredient[]; ingredientPurchases: IngredientPurchase[]; onAddIngredient: (name: string, unit: IngredientUnit) => Promise<void>; onRegisterPurchase: (ingredientId: string, quantity: number, totalCost: number) => Promise<void>; onAdjustStock: (ingredientId: string, newStock: number) => Promise<void>; onSetMinStock: (ingredientId: string, minStock: number | null) => Promise<void>; onEditPurchase: (purchase: IngredientPurchase, newQuantity: number, newTotalCost: number) => Promise<void>; onDeletePurchase: (purchase: IngredientPurchase) => Promise<void> }) {
  const [newName, setNewName] = useState("");
  const [newUnit, setNewUnit] = useState<IngredientUnit>("kg");
  const [addingIngredient, setAddingIngredient] = useState(false);
  const [purchaseDrafts, setPurchaseDrafts] = useState<Record<string, { quantity: string; totalCost: string }>>({});
  const [savingPurchaseId, setSavingPurchaseId] = useState<string | null>(null);
  const [adjustDrafts, setAdjustDrafts] = useState<Record<string, string>>({});
  const [savingAdjustId, setSavingAdjustId] = useState<string | null>(null);
  const [minStockDrafts, setMinStockDrafts] = useState<Record<string, string>>({});
  const [savingMinStockId, setSavingMinStockId] = useState<string | null>(null);
  const [expandedHistoryId, setExpandedHistoryId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const normalize = (value: string) => value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const filteredIngredients = searchQuery.trim() === "" ? ingredients : ingredients.filter((ingredient) => normalize(ingredient.name).includes(normalize(searchQuery.trim())));

  const handleAddIngredient = () => {
    const name = newName.trim();
    if (!name) return;
    setAddingIngredient(true);
    onAddIngredient(name, newUnit).then(() => { setNewName(""); setNewUnit("kg"); }).finally(() => setAddingIngredient(false));
  };

  const handleSavePurchase = (ingredient: Ingredient) => {
    const draft = purchaseDrafts[ingredient.id] ?? { quantity: "", totalCost: "" };
    const quantity = Number(draft.quantity.replace(",", "."));
    const totalCost = Number(draft.totalCost.replace(",", "."));
    if (!quantity || quantity <= 0 || !totalCost || totalCost <= 0) return;
    const unitCost = totalCost / quantity;
    if (isPurchasePriceUnusual(unitCost, ingredient.avgCost)) {
      const confirmed = window.confirm(`Esse valor (R$${unitCost.toFixed(2)}/${UNIT_LABELS[ingredient.unit]}) tá bem diferente do custo médio atual (R$${ingredient.avgCost.toFixed(2)}). Confirma mesmo assim?`);
      if (!confirmed) return;
    }
    setSavingPurchaseId(ingredient.id);
    onRegisterPurchase(ingredient.id, quantity, totalCost)
      .then(() => setPurchaseDrafts((current) => ({ ...current, [ingredient.id]: { quantity: "", totalCost: "" } })))
      .finally(() => setSavingPurchaseId(null));
  };

  const handleSaveAdjust = (ingredient: Ingredient) => {
    const draft = adjustDrafts[ingredient.id];
    if (draft === undefined) return;
    const newStock = Number(draft.replace(",", "."));
    if (Number.isNaN(newStock) || newStock < 0) return;
    setSavingAdjustId(ingredient.id);
    onAdjustStock(ingredient.id, newStock).then(() => setAdjustDrafts((current) => { const next = { ...current }; delete next[ingredient.id]; return next; })).finally(() => setSavingAdjustId(null));
  };

  const handleSaveMinStock = (ingredient: Ingredient) => {
    const draft = minStockDrafts[ingredient.id];
    if (draft === undefined) return;
    const trimmed = draft.trim();
    const minStock = trimmed === "" ? null : Number(trimmed.replace(",", "."));
    if (minStock !== null && (Number.isNaN(minStock) || minStock < 0)) return;
    setSavingMinStockId(ingredient.id);
    onSetMinStock(ingredient.id, minStock).then(() => setMinStockDrafts((current) => { const next = { ...current }; delete next[ingredient.id]; return next; })).finally(() => setSavingMinStockId(null));
  };

  return (
    <div className="mt-10 rounded-2xl border border-white/10 bg-[#171211] p-6">
      <p className="text-xs font-bold uppercase tracking-[.18em] text-[#ff7c50]">🧂 Ingredientes e Estoque</p>
      <h2 className="mt-1 font-display text-xl font-extrabold tracking-[-.03em]">Compras e custo</h2>
      <p className="mt-1.5 text-sm text-white/50">Cadastre os ingredientes que vocês compram, registre cada compra (quanto comprou + quanto pagou) e o custo médio atualiza sozinho. Lança a quantidade na mesma unidade da nota fiscal (ex.: se veio uma caixa com 50 unidades, lança 50 — não 1 pelo preço da caixa inteira). Errou alguma compra? Edita ou apaga ela no histórico — o custo médio se ajusta sozinho. Precisa corrigir só a quantidade em estoque (perda, quebra)? Usa o ajuste manual, sem mexer no custo. Define um "estoque mínimo" pra aparecer na lista de compras logo abaixo quando acabar.</p>

      {(() => {
        const outOfStockCount = ingredients.filter((ingredient) => ingredient.stock <= 0).length;
        const lowStockCount = ingredients.filter((ingredient) => ingredient.stock > 0 && ingredient.minStock !== null && ingredient.stock < ingredient.minStock).length;
        if (outOfStockCount === 0 && lowStockCount === 0) return null;
        return (
          <div className="mt-4 flex flex-wrap gap-2">
            {outOfStockCount > 0 && <span className="rounded-full bg-red-500/15 px-3 py-1.5 text-xs font-bold text-red-400">🔴 {outOfStockCount} ingrediente{outOfStockCount === 1 ? "" : "s"} esgotado{outOfStockCount === 1 ? "" : "s"}</span>}
            {lowStockCount > 0 && <span className="rounded-full bg-amber-400/15 px-3 py-1.5 text-xs font-bold text-amber-300">🟡 {lowStockCount} esgotando</span>}
          </div>
        );
      })()}

      <div className="mt-5 flex flex-wrap items-end gap-2 rounded-xl border border-white/10 bg-white/[0.03] p-3">
        <div className="min-w-0 flex-1">
          <label className="text-[10px] font-bold uppercase tracking-[.14em] text-white/45">Novo ingrediente</label>
          <input type="text" value={newName} onChange={(event) => setNewName(event.target.value)} placeholder="Ex: Salmão" className="mt-1.5 w-full rounded-lg border border-white/15 bg-white/[0.06] px-3 py-2 text-sm text-white outline-none focus:border-[#ff6b32]" />
        </div>
        <select value={newUnit} onChange={(event) => setNewUnit(event.target.value as IngredientUnit)} className="rounded-lg border border-white/15 bg-white/[0.06] px-3 py-2 text-sm text-white outline-none focus:border-[#ff6b32]">
          {(Object.keys(UNIT_LABELS) as IngredientUnit[]).map((unit) => <option key={unit} value={unit} className="bg-[#171211]">{UNIT_LABELS[unit]}</option>)}
        </select>
        <button type="button" onClick={handleAddIngredient} disabled={addingIngredient || !newName.trim()} className="rounded-full bg-[#ff5a19] px-4 py-2 text-xs font-bold text-white transition hover:bg-[#ff6a2e] disabled:cursor-not-allowed disabled:opacity-40">{addingIngredient ? "Adicionando…" : "+ Adicionar"}</button>
      </div>

      <div className="mt-5">
        <label className="text-[10px] font-bold uppercase tracking-[.14em] text-white/45">Buscar ingrediente</label>
        <input type="text" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Digite o nome, ex: coca, salmão…" className="mt-1.5 w-full rounded-lg border border-white/15 bg-white/[0.06] px-3 py-2 text-sm text-white outline-none focus:border-[#ff6b32]" />
      </div>

      <div className="mt-4 divide-y divide-white/10 rounded-xl border border-white/10">
        {ingredients.length === 0 ? (
          <p className="p-4 text-sm text-white/50">Nenhum ingrediente cadastrado ainda.</p>
        ) : filteredIngredients.length === 0 ? (
          <p className="p-4 text-sm text-white/50">Nenhum ingrediente encontrado pra "{searchQuery.trim()}".</p>
        ) : filteredIngredients.map((ingredient) => {
          const draft = purchaseDrafts[ingredient.id] ?? { quantity: "", totalCost: "" };
          const adjustDraft = adjustDrafts[ingredient.id];
          const history = ingredientPurchases.filter((purchase) => purchase.ingredientId === ingredient.id);
          return (
            <div key={ingredient.id} className="p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="text-sm font-bold text-white">{ingredient.name}</span>
                  {ingredient.stock <= 0 ? (
                    <span className="ml-2 rounded-full bg-red-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-red-400">🔴 Esgotado</span>
                  ) : ingredient.minStock !== null && ingredient.stock < ingredient.minStock ? (
                    <span className="ml-2 rounded-full bg-amber-400/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-300">🟡 Esgotando</span>
                  ) : null}
                  <span className="ml-2 text-xs text-white/50">{ingredient.stock.toLocaleString("pt-BR")} {UNIT_LABELS[ingredient.unit]} em estoque · custo médio R${ingredient.avgCost.toFixed(2)}/{UNIT_LABELS[ingredient.unit]}{ingredient.minStock !== null && <> · mínimo {ingredient.minStock.toLocaleString("pt-BR")} {UNIT_LABELS[ingredient.unit]}</>}</span>
                </div>
                {history.length > 0 && <button type="button" onClick={() => setExpandedHistoryId(expandedHistoryId === ingredient.id ? null : ingredient.id)} className="text-[11px] font-bold text-white/40 underline decoration-dotted underline-offset-2 hover:text-white">{expandedHistoryId === ingredient.id ? "Esconder histórico" : `Histórico (${history.length})`}</button>}
              </div>
              <div className="mt-3 flex flex-wrap items-end gap-2">
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-[.14em] text-white/45">Comprou quanto</label>
                  <input type="text" inputMode="decimal" value={draft.quantity} onChange={(event) => setPurchaseDrafts((current) => ({ ...current, [ingredient.id]: { ...draft, quantity: event.target.value } }))} placeholder={UNIT_LABELS[ingredient.unit]} className="mt-1.5 w-28 rounded-lg border border-white/15 bg-white/[0.06] px-2.5 py-1.5 text-sm text-white outline-none focus:border-[#ff6b32]" />
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-[.14em] text-white/45">Pagou quanto (R$)</label>
                  <input type="text" inputMode="decimal" value={draft.totalCost} onChange={(event) => setPurchaseDrafts((current) => ({ ...current, [ingredient.id]: { ...draft, totalCost: event.target.value } }))} placeholder="0,00" className="mt-1.5 w-28 rounded-lg border border-white/15 bg-white/[0.06] px-2.5 py-1.5 text-sm text-white outline-none focus:border-[#ff6b32]" />
                </div>
                <button type="button" onClick={() => handleSavePurchase(ingredient)} disabled={savingPurchaseId === ingredient.id} className="rounded-full border border-white/15 px-3.5 py-1.5 text-xs font-bold text-white/80 transition hover:border-white/35 hover:text-white disabled:cursor-wait disabled:opacity-50">{savingPurchaseId === ingredient.id ? "Salvando…" : "Registrar compra"}</button>
                <div className="ml-auto flex items-end gap-2">
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-[.14em] text-white/45">Ajustar estoque pra</label>
                    <input type="text" inputMode="decimal" value={adjustDraft ?? ""} onChange={(event) => setAdjustDrafts((current) => ({ ...current, [ingredient.id]: event.target.value }))} placeholder={String(ingredient.stock)} className="mt-1.5 w-24 rounded-lg border border-white/15 bg-white/[0.06] px-2.5 py-1.5 text-sm text-white outline-none focus:border-[#ff6b32]" />
                  </div>
                  <button type="button" onClick={() => handleSaveAdjust(ingredient)} disabled={savingAdjustId === ingredient.id || adjustDraft === undefined} className="rounded-full border border-white/15 px-3.5 py-1.5 text-xs font-bold text-white/60 transition hover:border-white/35 hover:text-white disabled:cursor-wait disabled:opacity-50">{savingAdjustId === ingredient.id ? "…" : "Ajustar"}</button>
                </div>
                <div className="flex items-end gap-2">
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-[.14em] text-white/45">Estoque mínimo</label>
                    <input type="text" inputMode="decimal" value={minStockDrafts[ingredient.id] ?? ""} onChange={(event) => setMinStockDrafts((current) => ({ ...current, [ingredient.id]: event.target.value }))} placeholder={ingredient.minStock !== null ? String(ingredient.minStock) : "sem mínimo"} className="mt-1.5 w-24 rounded-lg border border-white/15 bg-white/[0.06] px-2.5 py-1.5 text-sm text-white outline-none focus:border-[#ff6b32]" />
                  </div>
                  <button type="button" onClick={() => handleSaveMinStock(ingredient)} disabled={savingMinStockId === ingredient.id || minStockDrafts[ingredient.id] === undefined} className="rounded-full border border-white/15 px-3.5 py-1.5 text-xs font-bold text-white/60 transition hover:border-white/35 hover:text-white disabled:cursor-wait disabled:opacity-50">{savingMinStockId === ingredient.id ? "…" : "Definir"}</button>
                </div>
              </div>
              {expandedHistoryId === ingredient.id && (
                <div className="mt-3 divide-y divide-white/10 rounded-lg border border-white/10 bg-white/[0.02] px-3">
                  {history.map((purchase) => <PurchaseHistoryRow key={purchase.id} purchase={purchase} unit={ingredient.unit} onEdit={(newQuantity, newTotalCost) => onEditPurchase(purchase, newQuantity, newTotalCost)} onDelete={() => onDeletePurchase(purchase)} />)}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

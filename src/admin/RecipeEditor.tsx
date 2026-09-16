import { useState } from "react";
import type { Ingredient } from "./ingredients";
import type { RecipeIngredient } from "./recipes";

export default function RecipeEditor({ itemId, itemName, ingredients, recipe, onSave }: { itemId: string; itemName: string; ingredients: Ingredient[]; recipe: RecipeIngredient[]; onSave: (itemId: string, ingredients: RecipeIngredient[]) => Promise<void> }) {
  const [draft, setDraft] = useState<RecipeIngredient[]>(recipe.length > 0 ? recipe : []);
  const [saving, setSaving] = useState(false);

  const addRow = () => {
    if (ingredients.length === 0) return;
    setDraft((current) => [...current, { ingredientId: ingredients[0].id, quantity: 0 }]);
  };
  const updateRow = (index: number, next: Partial<RecipeIngredient>) => setDraft((current) => current.map((row, i) => (i === index ? { ...row, ...next } : row)));
  const removeRow = (index: number) => setDraft((current) => current.filter((_, i) => i !== index));

  const handleSave = () => {
    setSaving(true);
    onSave(itemId, draft.filter((row) => row.quantity > 0)).finally(() => setSaving(false));
  };

  if (ingredients.length === 0) {
    return <div className="mt-2 rounded-lg border border-dashed border-white/15 p-3 text-xs text-white/45">Cadastre algum ingrediente em "Ingredientes e Estoque" (embaixo do cardápio) antes de montar a ficha técnica.</div>;
  }

  return (
    <div className="mt-2 rounded-lg border border-white/10 bg-white/[0.03] p-3">
      <p className="text-[10px] font-bold uppercase tracking-[.14em] text-white/45">Ficha técnica — {itemName}</p>
      <p className="mt-1 text-[11px] leading-relaxed text-white/40">Usa a quantidade BRUTA (antes de limpar/descartar casca, osso etc.) — se 1kg de cebola crua rende só 850g limpa e o prato usa 100g limpa, lança ~118g de cebola aqui, não 100g.</p>
      <div className="mt-2 space-y-2">
        {draft.map((row, index) => {
          const ingredient = ingredients.find((candidate) => candidate.id === row.ingredientId);
          return (
            <div key={index} className="flex items-center gap-2">
              <select value={row.ingredientId} onChange={(event) => updateRow(index, { ingredientId: event.target.value })} className="min-w-0 flex-1 rounded-lg border border-white/15 bg-white/[0.06] px-2.5 py-1.5 text-xs text-white outline-none focus:border-[#ff6b32]">
                {ingredients.map((option) => <option key={option.id} value={option.id} className="bg-[#171211]">{option.name}</option>)}
              </select>
              <input type="text" inputMode="decimal" value={row.quantity || ""} onChange={(event) => updateRow(index, { quantity: Number(event.target.value.replace(",", ".")) || 0 })} placeholder={ingredient?.unit ?? "qtd"} className="w-20 rounded-lg border border-white/15 bg-white/[0.06] px-2.5 py-1.5 text-xs text-white outline-none focus:border-[#ff6b32]" />
              <span className="w-10 shrink-0 text-[10px] text-white/40">{ingredient?.unit}</span>
              <button type="button" onClick={() => removeRow(index)} className="shrink-0 text-xs font-bold text-red-400/80 hover:text-red-300">✕</button>
            </div>
          );
        })}
      </div>
      <div className="mt-2.5 flex items-center gap-2">
        <button type="button" onClick={addRow} className="rounded-full border border-white/15 px-3 py-1.5 text-[11px] font-bold text-white/70 transition hover:border-white/35 hover:text-white">+ Ingrediente</button>
        <button type="button" onClick={handleSave} disabled={saving} className="rounded-full bg-[#ff5a19] px-3.5 py-1.5 text-[11px] font-bold text-white transition hover:bg-[#ff6a2e] disabled:cursor-wait disabled:opacity-50">{saving ? "Salvando…" : "Salvar ficha técnica"}</button>
      </div>
    </div>
  );
}

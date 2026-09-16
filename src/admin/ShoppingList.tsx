import type { Ingredient } from "./ingredients";

const UNIT_LABELS: Record<string, string> = { kg: "kg", l: "litros", un: "unidades" };

const buildShareText = (items: Ingredient[]): string => {
  const lines = items.map((item) => `- ${item.name}: ${item.stock.toLocaleString("pt-BR")} ${UNIT_LABELS[item.unit] ?? item.unit}`);
  return ["Lista de compras — Sooba", "", ...lines].join("\n");
};

/** Abre o WhatsApp com a lista pronta pra mandar pra quem for fazer a compra — sem número fixo, pra poder escolher o contato ou grupo na hora. */
const shareOnWhatsApp = (items: Ingredient[]): void => {
  window.open(`https://wa.me/?text=${encodeURIComponent(buildShareText(items))}`, "_blank", "noopener,noreferrer");
};

export default function ShoppingList({ ingredients }: { ingredients: Ingredient[] }) {
  const needsRestock = ingredients.filter((ingredient) => ingredient.minStock !== null && ingredient.stock < ingredient.minStock);
  const sortedByStock = [...ingredients].sort((a, b) => a.stock - b.stock);

  return (
    <div className="rounded-2xl border border-white/10 bg-[#171211] p-6">
      <p className="text-xs font-bold uppercase tracking-[.18em] text-[#ff7c50]">Lista de compras</p>
      <h3 className="mt-1 font-display text-lg font-extrabold tracking-[-.03em]">O que precisa repor</h3>
      <p className="mt-1.5 text-sm text-white/50">Define um estoque mínimo pra cada ingrediente (na lista de "Ingredientes e Estoque" acima) e aqui aparece só quem estiver abaixo dele.</p>

      {needsRestock.length > 0 && (
        <div className="mt-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-bold text-amber-300">⚠️ Precisa comprar ({needsRestock.length})</p>
            <button type="button" onClick={() => shareOnWhatsApp(needsRestock)} className="rounded-full border border-white/15 px-3 py-1.5 text-[11px] font-bold text-white/70 transition hover:border-white/35 hover:text-white">📤 Compartilhar</button>
          </div>
          <div className="mt-2 divide-y divide-amber-400/20 rounded-xl border border-amber-400/30 bg-amber-400/5">
            {needsRestock.map((ingredient) => (
              <div key={ingredient.id} className="flex items-center justify-between gap-2 p-3 text-sm">
                <span className="font-bold text-white">{ingredient.name}</span>
                <span className="text-amber-300">{ingredient.stock.toLocaleString("pt-BR")} {UNIT_LABELS[ingredient.unit]} <span className="text-amber-300/60">(mínimo {ingredient.minStock!.toLocaleString("pt-BR")})</span></span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-5">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-bold text-white/60">Todos os ingredientes (do mais baixo pro mais alto)</p>
          {sortedByStock.length > 0 && <button type="button" onClick={() => shareOnWhatsApp(sortedByStock)} className="rounded-full border border-white/15 px-3 py-1.5 text-[11px] font-bold text-white/70 transition hover:border-white/35 hover:text-white">📤 Compartilhar</button>}
        </div>
        <div className="mt-2 divide-y divide-white/10 rounded-xl border border-white/10">
          {sortedByStock.length === 0 ? (
            <p className="p-4 text-sm text-white/50">Nenhum ingrediente cadastrado ainda.</p>
          ) : sortedByStock.map((ingredient) => (
            <div key={ingredient.id} className="flex items-center justify-between gap-2 p-3 text-sm">
              <span className="text-white/80">{ingredient.name}</span>
              <span className="text-white/50">{ingredient.stock.toLocaleString("pt-BR")} {UNIT_LABELS[ingredient.unit]}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

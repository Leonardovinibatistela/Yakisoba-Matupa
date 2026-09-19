import type { Ingredient } from "./ingredients";

const UNIT_LABELS: Record<string, string> = { kg: "kg", g: "g", l: "litros", ml: "ml", un: "unidades" };

/** Quanto falta pra esse ingrediente voltar pro mínimo definido — só faz sentido quando tem mínimo e o estoque já está abaixo dele. */
const missingToReachMin = (ingredient: Ingredient): number | null => {
  if (ingredient.minStock === null || ingredient.stock >= ingredient.minStock) return null;
  return ingredient.minStock - ingredient.stock;
};

const formatIngredientLine = (item: Ingredient): string => {
  const unit = UNIT_LABELS[item.unit] ?? item.unit;
  const missing = missingToReachMin(item);
  if (missing !== null) return `- ${item.name}: comprar pelo menos ${missing.toLocaleString("pt-BR")} ${unit} (tem ${item.stock.toLocaleString("pt-BR")}, mínimo é ${item.minStock!.toLocaleString("pt-BR")})`;
  return `- ${item.name}: ${item.stock.toLocaleString("pt-BR")} ${unit} em estoque`;
};

const buildShareText = (items: Ingredient[]): string => ["Lista de compras — Sooba", "", ...items.map(formatIngredientLine)].join("\n");

/** Abre o WhatsApp com a lista pronta pra mandar pra quem for fazer a compra — sem número fixo, pra poder escolher o contato ou grupo na hora. */
const shareOnWhatsApp = (items: Ingredient[]): void => {
  window.open(`https://wa.me/?text=${encodeURIComponent(buildShareText(items))}`, "_blank", "noopener,noreferrer");
};

export default function ShoppingList({ ingredients }: { ingredients: Ingredient[] }) {
  const needsRestock = ingredients.filter((ingredient) => missingToReachMin(ingredient) !== null);
  const sortedByStock = [...ingredients].sort((a, b) => a.stock - b.stock);

  return (
    <div className="rounded-2xl border border-white/10 bg-[#171211] p-6">
      <p className="text-xs font-bold uppercase tracking-[.18em] text-[#ff7c50]">Lista de compras</p>
      <h3 className="mt-1 font-display text-lg font-extrabold tracking-[-.03em]">O que precisa repor</h3>
      <p className="mt-1.5 text-sm text-white/50">Define um estoque mínimo pra cada ingrediente (na lista de "Ingredientes e Estoque" acima) e aqui aparece só quem estiver abaixo dele, já com quanto falta comprar.</p>

      {needsRestock.length > 0 && (
        <div className="mt-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-bold text-amber-300">⚠️ Precisa comprar ({needsRestock.length})</p>
            <button type="button" onClick={() => shareOnWhatsApp(needsRestock)} className="rounded-full border border-white/15 px-3 py-1.5 text-[11px] font-bold text-white/70 transition hover:border-white/35 hover:text-white">📤 Compartilhar</button>
          </div>
          <div className="mt-2 divide-y divide-amber-400/20 rounded-xl border border-amber-400/30 bg-amber-400/5">
            {needsRestock.map((ingredient) => {
              const missing = missingToReachMin(ingredient)!;
              return (
                <div key={ingredient.id} className="flex items-center justify-between gap-2 p-3 text-sm">
                  <span className="font-bold text-white">{ingredient.name}</span>
                  <span className="text-right">
                    <span className="block font-bold text-amber-300">comprar pelo menos {missing.toLocaleString("pt-BR")} {UNIT_LABELS[ingredient.unit]}</span>
                    <span className="block text-[11px] text-amber-300/60">tem {ingredient.stock.toLocaleString("pt-BR")}, mínimo é {ingredient.minStock!.toLocaleString("pt-BR")}</span>
                  </span>
                </div>
              );
            })}
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

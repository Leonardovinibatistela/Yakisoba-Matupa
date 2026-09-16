import type { StockMovement } from "./stockMovements";

const formatQuantity = (item: { quantity: number; unit: string }) => `${item.quantity.toLocaleString("pt-BR", { maximumFractionDigits: 3 })} ${item.unit}`.trim();

export default function StockMovementsLog({ movements }: { movements: StockMovement[] }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-[#171211] p-6">
      <p className="text-xs font-bold uppercase tracking-[.18em] text-[#ff7c50]">Movimentação de estoque</p>
      <h3 className="mt-1 font-display text-lg font-extrabold tracking-[-.03em]">O que cada pedido descontou (e devolveu, se foi apagado)</h3>
      <div className="mt-4 max-h-96 overflow-y-auto divide-y divide-white/10 rounded-xl border border-white/10">
        {movements.length === 0 ? (
          <p className="p-4 text-sm text-white/50">Nenhuma movimentação ainda.</p>
        ) : movements.map((movement) => (
          <div key={movement.id} className="p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className={`text-xs font-bold ${movement.type === "devolucao" ? "text-amber-300" : "text-white"}`}>{movement.type === "devolucao" ? "↩️ Apagado — devolveu" : "📦 Descontou"} — Pedido #{movement.orderNumber}</span>
              <span className="text-[11px] text-white/40">{movement.createdAt.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
            </div>
            <p className="mt-1 text-xs text-white/55">{movement.items.map((item) => `${formatQuantity(item)} ${item.ingredientName}`).join(", ")}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

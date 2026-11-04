import { useState, type ComponentProps } from "react";
import KitchenPanel from "./KitchenPanel";
import ManualOrderPanel from "./ManualOrderPanel";

type View = "cozinha" | "pedido";
const VIEWS: { id: View; label: string }[] = [
  { id: "cozinha", label: "🍳 Cozinha" },
  { id: "pedido", label: "📝 Pedido manual" },
];

type Props = {
  kitchen: ComponentProps<typeof KitchenPanel>;
  /** null quando quem está logado não pode lançar pedido manual: aí só aparece a Cozinha, sem os dois botões. */
  manualOrder: ComponentProps<typeof ManualOrderPanel> | null;
};

/**
 * Cozinha e Pedido manual juntos, na mesma aba (e também na tela travada com senha): dois botões no topo alternam entre a
 * lista de pedidos e o lançamento de um pedido manual. As duas telas ficam montadas (só escondidas), então dá pra olhar a
 * cozinha no meio de um pedido manual sem perder o que foi digitado.
 */
export default function KitchenWorkspace({ kitchen, manualOrder }: Props) {
  const [view, setView] = useState<View>("cozinha");
  const showManual = manualOrder !== null && view === "pedido";
  return (
    <>
      {manualOrder && (
        <div role="tablist" aria-label="Tela" className="mt-5 grid grid-cols-2 gap-2">
          {VIEWS.map(({ id, label }) => (
            <button key={id} type="button" role="tab" aria-selected={view === id} onClick={() => setView(id)} className={`min-h-[48px] rounded-full border px-4 text-sm font-extrabold transition ${view === id ? "border-[#ff5a19] bg-[#ff5a19] text-white" : "border-white/15 text-white/70 hover:border-white/35 hover:text-white"}`}>{label}</button>
          ))}
        </div>
      )}
      <div className={showManual ? "hidden" : ""}>
        <KitchenPanel {...kitchen} />
      </div>
      {manualOrder && (
        <div className={showManual ? "" : "hidden"}>
          <ManualOrderPanel {...manualOrder} />
        </div>
      )}
    </>
  );
}

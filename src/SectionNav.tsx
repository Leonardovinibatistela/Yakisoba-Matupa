import { useEffect, useRef, useState } from "react";
import { centerScrollLeft, pickActiveSection, scrollEdges } from "./sectionNavLogic";

export type SectionNavItem = { id: string; label: string };

// Linha (px a partir do topo da tela) em que a seção passa a ser "a atual": cabeçalho fixo (72) + esta barra (49) + folga.
const SPY_LINE = 160;
const reducedMotion = () => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/**
 * Barra de abas do cardápio: uma linha só, fica grudada embaixo do cabeçalho, a aba da seção que está na tela ganha o traço laranja
 * (acompanha a rolagem e se centraliza sozinha), e no computador tem setas + degradê nas pontas quando tem aba escondida.
 */
export default function SectionNav({ items, activeId, onSelect }: { items: SectionNavItem[]; activeId: string; onSelect: (id: string, scroll?: boolean) => void }) {
  const scroller = useRef<HTMLDivElement>(null);
  const chips = useRef<Record<string, HTMLButtonElement | null>>({});
  const latest = useRef({ items, activeId, onSelect });
  latest.current = { items, activeId, onSelect };
  const clickScrolling = useRef(false);
  const settleTimer = useRef(0);
  const [edges, setEdges] = useState({ canLeft: false, canRight: false });
  const idsKey = items.map((item) => item.id).join("|");

  const updateEdges = () => {
    const bar = scroller.current;
    if (!bar) return;
    const next = scrollEdges(bar.scrollLeft, bar.clientWidth, bar.scrollWidth);
    setEdges((prev) => (prev.canLeft === next.canLeft && prev.canRight === next.canRight ? prev : next));
  };

  // Enquanto a página rola sozinha por causa de um clique na aba, não deixa as abas do caminho piscarem: espera a rolagem parar.
  const holdSpy = () => {
    window.clearTimeout(settleTimer.current);
    settleTimer.current = window.setTimeout(() => { clickScrolling.current = false; }, 160);
  };

  // A aba acompanha a seção que está na tela.
  useEffect(() => {
    let frame = 0;
    const onScroll = () => {
      if (clickScrolling.current) { holdSpy(); return; }
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const { items: list, activeId: current, onSelect: select } = latest.current;
        const ids = list.map((item) => item.id);
        const tops = ids.map((id) => { const el = document.getElementById(id); return el ? el.getBoundingClientRect().top : null; });
        const next = pickActiveSection(ids, tops, SPY_LINE);
        if (next && next !== current) select(next, false);
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => { window.removeEventListener("scroll", onScroll); cancelAnimationFrame(frame); window.clearTimeout(settleTimer.current); };
  }, [idsKey]);

  // A aba ativa vai pro meio da barra (só a barra rola; a página não pula).
  useEffect(() => {
    const bar = scroller.current;
    const chip = chips.current[activeId];
    if (!bar || !chip) return;
    bar.scrollTo({ left: centerScrollLeft(chip.offsetLeft, chip.offsetWidth, bar.clientWidth, bar.scrollWidth), behavior: reducedMotion() ? "auto" : "smooth" });
  }, [activeId, idsKey]);

  // Setas e degradês dependem de quanto cabe na tela (muda ao girar o celular, redimensionar a janela, carregar a fonte).
  useEffect(() => {
    updateEdges();
    window.addEventListener("resize", updateEdges);
    void document.fonts?.ready.then(updateEdges);
    return () => window.removeEventListener("resize", updateEdges);
  }, [idsKey]);

  const choose = (id: string) => { clickScrolling.current = true; holdSpy(); onSelect(id); };
  const nudge = (direction: -1 | 1) => { const bar = scroller.current; if (bar) bar.scrollBy({ left: direction * Math.max(160, bar.clientWidth * 0.6), behavior: reducedMotion() ? "auto" : "smooth" }); };

  const arrow = "absolute top-1/2 hidden h-8 w-8 -translate-y-1/2 place-items-center rounded-full border border-[#1a1513]/15 bg-[#f5f0eb] text-[#1a1513] transition lg:grid hover:border-[#1a1513]/40 motion-reduce:transition-none";
  return (
    <div className="sticky top-[72px] z-20 -mx-5 mt-10 border-b border-[#1c1512]/10 bg-[#f5f0eb]/95 backdrop-blur lg:-mx-8">
      <nav aria-label="Seções do cardápio" className="relative">
        <div ref={scroller} onScroll={updateEdges} className="no-scrollbar relative flex overflow-x-auto px-1 lg:scroll-px-12 lg:px-4">
          {items.map((item) => {
            const active = item.id === activeId;
            return (
              <button
                key={item.id}
                ref={(el) => { chips.current[item.id] = el; }}
                type="button"
                onClick={() => choose(item.id)}
                aria-current={active ? "true" : undefined}
                className={`relative h-12 shrink-0 whitespace-nowrap px-4 text-[13px] font-bold transition-colors after:absolute after:inset-x-4 after:bottom-0 after:h-[3px] after:rounded-full after:bg-[#db4611] after:transition-transform after:duration-200 focus-visible:outline-2! focus-visible:-outline-offset-4! focus-visible:outline-[#1a1513]! motion-reduce:transition-none motion-reduce:after:transition-none ${active ? "text-[#1a1513] after:scale-x-100" : "text-[#6a5d55] after:scale-x-0 hover:text-[#1a1513]"}`}
              >
                {item.label}
              </button>
            );
          })}
        </div>
        <div aria-hidden="true" className={`pointer-events-none absolute inset-y-0 left-0 w-12 transition-opacity motion-reduce:transition-none ${edges.canLeft ? "opacity-100" : "opacity-0"}`} style={{ background: "linear-gradient(to right, #f5f0eb 30%, rgba(245,240,235,0))" }} />
        <div aria-hidden="true" className={`pointer-events-none absolute inset-y-0 right-0 w-12 transition-opacity motion-reduce:transition-none ${edges.canRight ? "opacity-100" : "opacity-0"}`} style={{ background: "linear-gradient(to left, #f5f0eb 30%, rgba(245,240,235,0))" }} />
        <button type="button" aria-label="Ver seções anteriores" tabIndex={edges.canLeft ? 0 : -1} onClick={() => nudge(-1)} className={`${arrow} left-2 ${edges.canLeft ? "opacity-100" : "pointer-events-none opacity-0"}`}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg>
        </button>
        <button type="button" aria-label="Ver mais seções" tabIndex={edges.canRight ? 0 : -1} onClick={() => nudge(1)} className={`${arrow} right-2 ${edges.canRight ? "opacity-100" : "pointer-events-none opacity-0"}`}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6" /></svg>
        </button>
      </nav>
    </div>
  );
}

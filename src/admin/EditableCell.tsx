import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Célula editável estilo planilha: clica (ou Enter) pra editar, Enter ou
 * clicar fora salva, Esc cancela. onCommit devolve um texto de erro (a
 * célula continua aberta, em vermelho) ou null se salvou.
 */
export default function EditableCell({ text, display, align = "left", numeric = false, placeholder = "—", listId, onCommit }: { text: string; display?: ReactNode; align?: "left" | "right"; numeric?: boolean; placeholder?: string; listId?: string; onCommit: (raw: string) => Promise<string | null> }) {
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

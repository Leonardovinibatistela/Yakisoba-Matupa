import { useState } from "react";
import { DEFAULT_CHECKOUT_EXTRAS, MAX_CHECKOUT_EXTRAS, MAX_EXTRA_FREE, MAX_EXTRA_NAME, checkExtraFields, describeExtraRule, newExtraId, normalizeExtraName, type CheckoutExtra } from "../checkoutExtras";
import { SAVE_FAILED, normalize, parseNumber, toDraft, withTimeout } from "./stockFormat";

const round2 = (value: number) => Math.round(value * 100) / 100;
const inputClass = "w-full rounded-lg border border-white/15 bg-white/[0.06] px-3 py-2 text-sm text-white outline-none placeholder:text-white/30 focus:border-[#ff6b32]";
const labelClass = "text-[10px] font-bold uppercase tracking-[.14em] text-white/45";
const smallButton = "min-h-[40px] rounded-full border border-white/15 px-3.5 text-xs font-bold text-white/75 transition hover:border-white/35 hover:text-white disabled:cursor-not-allowed disabled:opacity-40";
const GRID = "grid gap-2 grid-cols-[minmax(0,1fr)_6.5rem_5rem] sm:grid-cols-[minmax(0,1fr)_7.5rem_6rem]";

/** Uma linha da lista: nome, preço e quantos são grátis editáveis ("Salvar" aparece quando muda), ocultar/mostrar e remover. */
function ExtraRow({ extra, busy, onSave, onToggleHidden, onRemove }: { extra: CheckoutExtra; busy: boolean; onSave: (name: string, price: string, free: string) => string | null; onToggleHidden: () => void; onRemove: () => void }) {
  const [name, setName] = useState(extra.name);
  const [price, setPrice] = useState(toDraft(extra.price));
  const [free, setFree] = useState(String(extra.freeQuantity ?? 0));
  const [error, setError] = useState<string | null>(null);
  const dirty = normalizeExtraName(name) !== extra.name || parseNumber(price) !== extra.price || parseNumber(free) !== (extra.freeQuantity ?? 0);
  const touch = () => setError(null);
  return (
    <li className={`rounded-xl border p-3 ${extra.hidden ? "border-white/10 bg-white/[0.02] opacity-70" : "border-white/10 bg-white/[0.04]"}`}>
      <div className={GRID}>
        <div className="col-span-3 sm:col-span-1">
          <label htmlFor={`extra-name-${extra.id}`} className={labelClass}>Nome</label>
          <input id={`extra-name-${extra.id}`} type="text" value={name} maxLength={MAX_EXTRA_NAME} onChange={(event) => { setName(event.target.value); touch(); }} className={`mt-1 ${inputClass}`} />
        </div>
        <div className="col-span-2 sm:col-span-1">
          <label htmlFor={`extra-price-${extra.id}`} className={labelClass}>Preço (R$)</label>
          <input id={`extra-price-${extra.id}`} type="text" inputMode="decimal" value={price} onChange={(event) => { setPrice(event.target.value); touch(); }} className={`mt-1 ${inputClass}`} />
        </div>
        <div>
          <label htmlFor={`extra-free-${extra.id}`} className={labelClass}>Grátis</label>
          <input id={`extra-free-${extra.id}`} type="text" inputMode="numeric" value={free} onChange={(event) => { setFree(event.target.value); touch(); }} className={`mt-1 ${inputClass}`} />
        </div>
      </div>
      <p className="mt-1.5 text-[11px] leading-snug text-white/40">Pro cliente: {describeExtraRule(extra)}</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {dirty && <button type="button" disabled={busy} onClick={() => setError(onSave(name, price, free))} className="min-h-[40px] rounded-full bg-[#ff5a19] px-4 text-xs font-bold text-white transition hover:bg-[#ff6a2e] disabled:opacity-50">Salvar</button>}
        <button type="button" disabled={busy || dirty} onClick={onToggleHidden} className={smallButton}>{extra.hidden ? "👁 Mostrar no site" : "🙈 Ocultar do site"}</button>
        <button type="button" disabled={busy || dirty} onClick={onRemove} className="min-h-[40px] rounded-full border border-red-400/30 px-3.5 text-xs font-bold text-red-300 transition hover:border-red-400/60 hover:bg-red-400/10 disabled:cursor-not-allowed disabled:opacity-40">🗑 Remover</button>
        {extra.hidden && <span className="text-[11px] font-bold text-amber-300">Oculto: o cliente não vê</span>}
      </div>
      {error && <p role="alert" className="mt-2 text-xs font-semibold text-red-400">{error}</p>}
    </li>
  );
}

/**
 * Adicionais do fechamento do pedido (hashi, shoyu, tarê...): a equipe muda nome, preço e quantos são grátis, oculta, remove e cria novos.
 * Só nome e preço — não tem foto, de propósito (no celular fica mais rápido e limpo sem foto).
 */
export default function CheckoutExtrasPanel({ extras, onSave }: { extras: CheckoutExtra[] | null; onSave: (extras: CheckoutExtra[]) => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [newName, setNewName] = useState("");
  const [newPrice, setNewPrice] = useState("");
  const [newFree, setNewFree] = useState("1");
  const [newError, setNewError] = useState<string | null>(null);

  const list = extras ?? [];
  const sameName = (name: string, exceptId?: string) => list.some((extra) => extra.id !== exceptId && normalize(extra.name.trim()) === normalize(normalizeExtraName(name)));
  const persist = (next: CheckoutExtra[], okText: string) => {
    setBusy(true);
    setMessage(null);
    return withTimeout(onSave(next))
      .then(() => { setMessage({ ok: true, text: okText }); return true; })
      .catch(() => { setMessage({ ok: false, text: SAVE_FAILED }); return false; })
      .finally(() => setBusy(false));
  };
  const check = (name: string, priceText: string, freeText: string, exceptId?: string): { error: string } | { name: string; price: number; freeQuantity: number } => {
    const price = parseNumber(priceText);
    const freeQuantity = freeText.trim() === "" ? 0 : parseNumber(freeText);
    const error = checkExtraFields(name, price, freeQuantity);
    if (error) return { error };
    if (sameName(name, exceptId)) return { error: "Já existe um adicional com esse nome." };
    return { name: normalizeExtraName(name), price: round2(price), freeQuantity };
  };

  const saveRow = (id: string, name: string, priceText: string, freeText: string): string | null => {
    const result = check(name, priceText, freeText, id);
    if ("error" in result) return result.error;
    void persist(list.map((extra) => (extra.id === id ? { ...extra, ...result } : extra)), "✓ Salvo — o site já usa");
    return null;
  };
  const toggleHidden = (id: string) => void persist(list.map((extra) => {
    if (extra.id !== id) return extra;
    const { hidden: _hidden, ...rest } = extra;
    return extra.hidden ? rest : { ...rest, hidden: true };
  }), "✓ Salvo — o site já usa");
  const remove = (extra: CheckoutExtra) => {
    if (!window.confirm(`Remover "${extra.name}" dos adicionais? Os pedidos antigos continuam como estão.`)) return;
    void persist(list.filter((candidate) => candidate.id !== extra.id), `✓ "${extra.name}" removido`);
  };
  const add = () => {
    if (list.length >= MAX_CHECKOUT_EXTRAS) { setNewError(`O máximo é ${MAX_CHECKOUT_EXTRAS} adicionais.`); return; }
    const result = check(newName, newPrice, newFree);
    if ("error" in result) { setNewError(result.error); return; }
    setNewError(null);
    void persist([...list, { id: newExtraId(result.name, new Set(list.map((extra) => extra.id))), ...result }], `✓ "${result.name}" adicionado — o site já usa`).then((saved) => { if (saved) { setNewName(""); setNewPrice(""); setNewFree("1"); } });
  };
  const resetToDefault = () => {
    if (!window.confirm("Voltar pra lista padrão (Hashi, Shoyu light, Tarê, Gengibre e Adaptador de hashi, o primeiro de cada um grátis)? Os seus ajustes e os adicionais novos saem da lista.")) return;
    void persist(DEFAULT_CHECKOUT_EXTRAS, "✓ Lista padrão restaurada");
  };

  return (
    <div className="mt-10 rounded-2xl border border-white/10 bg-[#171211] p-4 sm:p-6">
      <p className="text-xs font-bold uppercase tracking-[.18em] text-[#ff7c50]">Fechamento do pedido</p>
      <h2 className="mt-1 font-display text-xl font-extrabold tracking-[-.03em]">Adicionais (hashi, shoyu, tarê...)</h2>
      <p className="mt-1.5 text-sm text-white/50">Aparecem pro cliente na hora de fechar o pedido. Em cada um, os primeiros são grátis (campo <strong className="text-white/70">Grátis</strong>, normalmente 1) e do seguinte em diante o cliente paga o preço. Aqui você muda nome, preço e quantos são grátis, oculta (some do site sem perder), remove e cria novos. É só nome e preço — sem foto, de propósito: fica mais rápido e limpo no celular.</p>

      {extras === null ? (
        <p className="mt-4 text-sm text-white/45">Carregando…</p>
      ) : (
        <>
          {list.length === 0 && <p className="mt-4 rounded-xl border border-dashed border-white/15 p-4 text-sm text-white/55">Nenhum adicional na lista: o cliente não vê nada de adicionais. Crie um abaixo ou volte pra lista padrão.</p>}
          <ul className="mt-4 space-y-2.5">
            {list.map((extra) => (
              <ExtraRow
                key={`${extra.id}|${extra.name}|${extra.price}|${extra.freeQuantity ?? 0}|${extra.hidden ? 1 : 0}`}
                extra={extra}
                busy={busy}
                onSave={(name, price, free) => saveRow(extra.id, name, price, free)}
                onToggleHidden={() => toggleHidden(extra.id)}
                onRemove={() => remove(extra)}
              />
            ))}
          </ul>

          <div className="mt-5 rounded-xl border border-white/10 bg-white/[0.03] p-3">
            <p className={labelClass}>Novo adicional</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-[minmax(0,1fr)_7.5rem_6rem_auto] sm:items-end">
              <div>
                <label htmlFor="new-extra-name" className="sr-only">Nome do novo adicional</label>
                <input id="new-extra-name" type="text" value={newName} maxLength={MAX_EXTRA_NAME} placeholder="Nome (ex.: Pimenta)" onChange={(event) => { setNewName(event.target.value); setNewError(null); }} className={inputClass} />
              </div>
              <div className="grid grid-cols-2 gap-2 sm:contents">
                <div>
                  <label htmlFor="new-extra-price" className="sr-only">Preço do novo adicional em reais</label>
                  <input id="new-extra-price" type="text" inputMode="decimal" value={newPrice} placeholder="Preço (R$)" onChange={(event) => { setNewPrice(event.target.value); setNewError(null); }} onKeyDown={(event) => { if (event.key === "Enter") add(); }} className={inputClass} />
                </div>
                <div>
                  <label htmlFor="new-extra-free" className="sr-only">Quantos são grátis (0 a {MAX_EXTRA_FREE})</label>
                  <input id="new-extra-free" type="text" inputMode="numeric" value={newFree} placeholder="Grátis" onChange={(event) => { setNewFree(event.target.value); setNewError(null); }} onKeyDown={(event) => { if (event.key === "Enter") add(); }} className={inputClass} />
                </div>
              </div>
              <button type="button" disabled={busy} onClick={add} className="min-h-[44px] rounded-full bg-[#ff5a19] px-5 text-xs font-bold text-white transition hover:bg-[#ff6a2e] disabled:opacity-50">＋ Adicionar</button>
            </div>
            <p className="mt-1.5 text-[11px] text-white/40">"Grátis": quantos dos primeiros o cliente leva sem pagar (1 = o primeiro é grátis; 0 = todos pagos).</p>
            {newError && <p role="alert" className="mt-2 text-xs font-semibold text-red-400">{newError}</p>}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button type="button" disabled={busy} onClick={resetToDefault} className={smallButton}>↩ Voltar à lista padrão</button>
            {message && <span role={message.ok ? "status" : "alert"} className={`text-xs font-bold ${message.ok ? "text-emerald-300" : "text-red-400"}`}>{message.text}</span>}
          </div>
        </>
      )}
    </div>
  );
}

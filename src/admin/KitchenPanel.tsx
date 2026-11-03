import { useEffect, useMemo, useState } from "react";
import type { OrderRecord } from "./adminData";
import { setOrderReady } from "./kitchen";
import { hasKitchenPin, isValidPin, lockKitchen, unlockKitchen } from "./kitchenLock";
import { buildTickets, productionSummary, type KitchenTicket } from "./kitchenView";
import { storeClock } from "./siteDiagnostics";

const digitsOnly = (value: string) => value.replace(/\D/g, "").slice(0, 4);
const pinInputClass = "min-h-[48px] w-32 rounded-lg border border-white/15 bg-white/[0.06] px-3 text-center text-xl font-extrabold tracking-[.4em] text-white outline-none placeholder:tracking-normal placeholder:text-white/30 focus:border-[#ff6b32]";
const MAX_PIN_FAILURES = 3;
const PIN_COOLDOWN_MS = 30000;

const agoLabel = (minutes: number) => (minutes < 1 ? "agora" : minutes < 60 ? `há ${minutes} min` : `há ${Math.floor(minutes / 60)}h${String(minutes % 60).padStart(2, "0")}`);

type Props = {
  orders: OrderRecord[] | null;
  /** Painel travado: só esta tela aparece, e o botão de cima vira "Destravar". */
  locked: boolean;
  onLockChange: (locked: boolean) => void;
  /** "Esqueci a senha": quem chama apaga a trava e sai da conta (só volta com o e-mail e a senha do painel). */
  onForgotPin: () => void;
  ordersTimedOut?: boolean;
};

/**
 * Aba "Cozinha": o que precisa ser preparado agora, pra quem cozinha — SEM nenhum valor (nem preço, nem total,
 * nem forma de pagamento, nem telefone ou endereço do cliente). Mostra o que chegou agora, a soma dos pratos pendentes
 * e a ficha de cada pedido com botão "Pronto". "Travar nesta tela" deixa só esta tela no aparelho, até digitar a senha.
 */
export default function KitchenPanel({ orders, locked, onLockChange, onForgotPin, ordersTimedOut }: Props) {
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 20000);
    return () => clearInterval(timer);
  }, []);
  const { arriving, pending, ready } = useMemo(() => buildTickets(orders ?? [], nowMs), [orders, nowMs]);
  const todoCount = arriving.length + pending.length;
  const summary = useMemo(() => productionSummary([...arriving, ...pending]), [arriving, pending]);
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState("");
  const [showReady, setShowReady] = useState(false);

  const mark = async (id: string, isReady: boolean) => {
    setError("");
    setBusyIds((previous) => new Set(previous).add(id));
    try {
      await setOrderReady(id, isReady);
    } catch {
      setError("Não consegui salvar. Confira a internet e tente de novo.");
    } finally {
      setBusyIds((previous) => { const next = new Set(previous); next.delete(id); return next; });
    }
  };

  return (
    <div className="mt-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[.18em] text-[#ff7c50]">Cozinha</p>
          <h2 className="mt-1 font-display text-2xl font-extrabold tracking-[-.03em]">{todoCount === 0 ? "Nada pra preparar agora" : `${todoCount} ${todoCount === 1 ? "pedido" : "pedidos"} pra preparar`}</h2>
        </div>
        <LockControls locked={locked} onLockChange={onLockChange} onForgotPin={onForgotPin} />
      </div>

      {error && <p role="alert" className="mt-3 rounded-xl border border-red-400/40 bg-red-500/10 px-4 py-2.5 text-sm font-bold text-red-200">{error}</p>}

      {orders === null ? (
        <div className="mt-5 rounded-2xl border border-white/10 bg-[#171211] p-6 text-center">
          <p className="text-sm text-white/60">{ordersTimedOut ? "Está demorando pra carregar os pedidos. Confira a internet ou recarregue a página." : "Carregando pedidos…"}</p>
          {ordersTimedOut && <button type="button" onClick={() => window.location.reload()} className="mt-3 rounded-full bg-[#ff5a19] px-4 py-2 text-xs font-bold text-white">Recarregar</button>}
        </div>
      ) : (
        <>
          {summary.length > 0 && (
            <section aria-label="O que preparar" className="mt-5 rounded-2xl border border-white/10 bg-[#171211] p-4 sm:p-5">
              <p className="text-[11px] font-bold uppercase tracking-[.16em] text-white/50">O que preparar (soma de tudo)</p>
              <ul className="mt-2 grid gap-x-6 gap-y-1 sm:grid-cols-2">
                {summary.map((line) => (
                  <li key={line.name} className="flex items-baseline gap-2 text-base font-bold"><span className="min-w-[2.5rem] text-xl font-extrabold text-[#ff8b60]">{line.qty}x</span><span>{line.name}</span></li>
                ))}
              </ul>
            </section>
          )}

          {arriving.length > 0 && (
            <section aria-label="Chegou agora" className="mt-5">
              <p className="text-sm font-extrabold uppercase tracking-[.14em] text-[#ff8b60]">🔔 Chegou agora ({arriving.length})</p>
              <div className="mt-2 space-y-3">{arriving.map((ticket) => <TicketCard key={ticket.id} ticket={ticket} nowMs={nowMs} busy={busyIds.has(ticket.id)} onReady={() => mark(ticket.id, true)} />)}</div>
            </section>
          )}

          {pending.length > 0 && (
            <section aria-label="Na fila" className="mt-5">
              <p className="text-sm font-extrabold uppercase tracking-[.14em] text-white/60">Na fila ({pending.length}) · o mais antigo primeiro</p>
              <div className="mt-2 space-y-3">{pending.map((ticket) => <TicketCard key={ticket.id} ticket={ticket} nowMs={nowMs} busy={busyIds.has(ticket.id)} onReady={() => mark(ticket.id, true)} />)}</div>
            </section>
          )}

          {todoCount === 0 && <p className="mt-5 rounded-2xl border border-white/10 bg-[#171211] p-6 text-center text-sm text-white/55">Quando chegar pedido novo ele aparece aqui e toca o sininho.</p>}

          {ready.length > 0 && (
            <section aria-label="Prontos" className="mt-6">
              <button type="button" onClick={() => setShowReady((value) => !value)} aria-expanded={showReady} className="text-xs font-bold uppercase tracking-[.14em] text-white/50 transition hover:text-white/80">{showReady ? "▾" : "▸"} Prontos hoje ({ready.length})</button>
              {showReady && (
                <ul className="mt-2 space-y-2">
                  {ready.map((ticket) => (
                    <li key={ticket.id} className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2.5">
                      <span className="min-w-0 truncate text-sm text-white/65"><span className="font-bold text-white/85">#{ticket.number}</span> · {ticket.kind === "retirada" ? "Retirada" : "Entrega"}{ticket.firstName ? ` · ${ticket.firstName}` : ""} · {ticket.items.map((item) => `${item.qty}x ${item.name}`).join(", ")}</span>
                      <button type="button" disabled={busyIds.has(ticket.id)} onClick={() => mark(ticket.id, false)} className="min-h-[40px] shrink-0 rounded-full border border-white/20 px-3.5 text-xs font-bold text-white/70 transition hover:border-white/40 hover:text-white disabled:opacity-50">↩ Desfazer</button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </>
      )}
    </div>
  );
}

function TicketCard({ ticket, nowMs, busy, onReady }: { ticket: KitchenTicket; nowMs: number; busy: boolean; onReady: () => void }) {
  const late = nowMs > ticket.dueAt.getTime();
  return (
    <article className={`rounded-2xl border p-4 sm:p-5 ${ticket.isNew ? "border-[#ff5a19] bg-[#ff5a19]/10" : "border-white/10 bg-[#171211]"}`}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span className="font-display text-2xl font-extrabold tracking-[-.03em]">#{ticket.number}</span>
        <span className={`rounded-full px-3 py-1 text-xs font-extrabold uppercase tracking-wide ${ticket.kind === "retirada" ? "bg-amber-400/15 text-amber-200" : "bg-sky-400/15 text-sky-200"}`}>{ticket.kind === "retirada" ? "Retirada" : "Entrega"}</span>
        {ticket.isNew && <span className="animate-pulse rounded-full bg-[#ff5a19] px-2.5 py-1 text-[11px] font-extrabold uppercase text-white">Novo</span>}
        {ticket.firstName && <span className="text-sm font-bold capitalize text-white/70">{ticket.firstName.toLowerCase()}</span>}
        <span className="ml-auto text-right text-xs font-semibold leading-snug text-white/55">Chegou {storeClock(ticket.arrivedAt.getTime())} · {agoLabel(ticket.minutesAgo)}<br /><span className={late ? "font-extrabold text-red-300" : ""}>Previsto {storeClock(ticket.dueAt.getTime())}{late ? " · atrasado" : ""}</span></span>
      </div>

      <ul className="mt-3 space-y-2">
        {ticket.items.map((item, index) => (
          <li key={index}>
            <p className="flex items-baseline gap-2 text-lg font-extrabold leading-snug"><span className="min-w-[2.5rem] text-[#ff8b60]">{item.qty}x</span><span>{item.name}</span></p>
            {item.addons.map((addon, addonIndex) => <p key={addonIndex} className="ml-[2.9rem] text-base font-bold text-amber-200">+ {addon.qty}x {addon.name}</p>)}
          </li>
        ))}
      </ul>

      {(ticket.cutlery || ticket.adapter || ticket.obs) && (
        <div className="mt-3 space-y-1.5">
          {(ticket.cutlery || ticket.adapter) && (
            <p className="flex flex-wrap gap-2 text-sm font-bold">
              {ticket.cutlery && <span className="rounded-lg bg-white/10 px-2.5 py-1 text-white/85">{ticket.cutlery === "Sem talher" ? "🚫 Sem talher" : `🥢 Talher: ${ticket.cutlery}`}</span>}
              {ticket.adapter && <span className="rounded-lg bg-white px-2.5 py-1 font-extrabold text-black">ADAPTADOR DE HASHI</span>}
            </p>
          )}
          {ticket.obs && <p className="rounded-lg border border-amber-300/40 bg-amber-300/10 px-3 py-2 text-base font-bold text-amber-100">Obs: {ticket.obs}</p>}
        </div>
      )}

      <button type="button" disabled={busy} onClick={onReady} className="mt-4 min-h-[52px] w-full rounded-full bg-emerald-500 px-6 py-3 text-base font-extrabold text-white transition hover:bg-emerald-400 disabled:cursor-wait disabled:opacity-50">{busy ? "Salvando…" : "✓ Pronto"}</button>
    </article>
  );
}

/** Botão "Travar nesta tela" / "Destravar" + o formulário de senha de 4 números. */
function LockControls({ locked, onLockChange, onForgotPin }: { locked: boolean; onLockChange: (locked: boolean) => void; onForgotPin: () => void }) {
  const [mode, setMode] = useState<"idle" | "create" | "enter">("idle");
  const [pin, setPin] = useState("");
  const [pinAgain, setPinAgain] = useState("");
  const [message, setMessage] = useState("");
  const [failures, setFailures] = useState(0);
  const [blockedUntil, setBlockedUntil] = useState(0);
  const [, tick] = useState(0);

  useEffect(() => {
    if (blockedUntil <= Date.now()) return;
    const timer = setInterval(() => { tick((value) => value + 1); if (Date.now() >= blockedUntil) clearInterval(timer); }, 1000);
    return () => clearInterval(timer);
  }, [blockedUntil]);
  const blockedSeconds = Math.max(0, Math.ceil((blockedUntil - Date.now()) / 1000));

  const close = () => { setMode("idle"); setPin(""); setPinAgain(""); setMessage(""); };

  const handleMainButton = async () => {
    setMessage("");
    if (locked) { setMode("enter"); return; }
    if (hasKitchenPin()) {
      const problem = await lockKitchen();
      if (problem) setMessage(problem);
      else onLockChange(true);
      return;
    }
    setMode("create");
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (mode === "create") {
      if (!isValidPin(pin)) return setMessage("A senha precisa ter 4 números.");
      if (pin !== pinAgain) return setMessage("As duas senhas são diferentes. Digite de novo.");
      const problem = await lockKitchen(pin);
      if (problem) return setMessage(problem);
      close();
      onLockChange(true);
      return;
    }
    if (mode === "enter") {
      if (blockedSeconds > 0) return;
      if (await unlockKitchen(pin)) { close(); setFailures(0); onLockChange(false); return; }
      const next = failures + 1;
      setPin("");
      if (next >= MAX_PIN_FAILURES) { setFailures(0); setBlockedUntil(Date.now() + PIN_COOLDOWN_MS); setMessage(`Senha errada ${MAX_PIN_FAILURES} vezes. Espere ${PIN_COOLDOWN_MS / 1000} segundos.`); return; }
      setFailures(next);
      setMessage("Senha incorreta.");
    }
  };

  const handleForgot = () => {
    if (window.confirm("Isso sai da conta neste aparelho. Pra voltar ao painel completo será preciso entrar de novo com o e-mail e a senha do painel. Continuar?")) onForgotPin();
  };

  return (
    <div className="flex flex-col items-end gap-2">
      {mode === "idle" && (
        <button type="button" onClick={handleMainButton} className="min-h-[44px] rounded-full border border-white/20 px-4 text-xs font-bold text-white/80 transition hover:border-white/40 hover:text-white">{locked ? "🔓 Destravar" : "🔒 Travar nesta tela"}</button>
      )}
      {mode !== "idle" && (
        <form onSubmit={handleSubmit} className="rounded-2xl border border-white/15 bg-[#171211] p-4">
          <p className="text-sm font-bold">{mode === "create" ? "Crie uma senha de 4 números" : "Digite a senha de 4 números"}</p>
          {mode === "create" && <p className="mt-1 max-w-[16rem] text-xs leading-snug text-white/50">Com a tela travada só a Cozinha aparece (sem faturamento nem valores). Guarde esta senha: sem ela não dá pra destravar.</p>}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <input type="password" inputMode="numeric" autoComplete="off" autoFocus maxLength={4} value={pin} onChange={(event) => setPin(digitsOnly(event.target.value))} placeholder="Senha" aria-label="Senha de 4 números" className={pinInputClass} />
            {mode === "create" && <input type="password" inputMode="numeric" autoComplete="off" maxLength={4} value={pinAgain} onChange={(event) => setPinAgain(digitsOnly(event.target.value))} placeholder="Repita" aria-label="Repita a senha" className={pinInputClass} />}
          </div>
          {message && <p role="alert" className="mt-2 text-xs font-bold text-red-300">{message}</p>}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button type="submit" disabled={mode === "enter" && blockedSeconds > 0} className="min-h-[44px] rounded-full bg-[#ff5a19] px-5 text-xs font-bold text-white transition hover:bg-[#ff6a2e] disabled:opacity-50">{mode === "create" ? "🔒 Travar" : blockedSeconds > 0 ? `Espere ${blockedSeconds}s` : "🔓 Destravar"}</button>
            <button type="button" onClick={close} className="min-h-[44px] rounded-full border border-white/15 px-4 text-xs font-bold text-white/70 transition hover:border-white/35 hover:text-white">Cancelar</button>
            {mode === "enter" && <button type="button" onClick={handleForgot} className="ml-auto text-[11px] font-semibold text-white/40 underline transition hover:text-white/70">Esqueci a senha</button>}
          </div>
        </form>
      )}
      {mode === "idle" && message && <p role="alert" className="max-w-[18rem] text-right text-xs font-bold text-red-300">{message}</p>}
    </div>
  );
}

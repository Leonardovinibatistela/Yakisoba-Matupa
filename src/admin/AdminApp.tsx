import { useEffect, useState } from "react";
import { onAuthStateChanged, signInWithEmailAndPassword, signOut, type User } from "firebase/auth";
import { auth } from "../firebase";
import { bestSellers, endOfDay, endOfMonth, fetchOrdersBetween, fetchRecentOrders, ordersInRange, revenueByWeekday, startOfDay, startOfMonth, startOfWeek, sumRevenue, type OrderRecord } from "./adminData";

const formatTotal = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const toDateInputValue = (date: Date) => {
  const d = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return d.toISOString().slice(0, 10);
};

export default function AdminApp() {
  const [user, setUser] = useState<User | null | undefined>(undefined); // undefined = ainda carregando

  useEffect(() => onAuthStateChanged(auth, setUser), []);

  if (user === undefined) return <div className="grid min-h-screen place-items-center bg-[#100d0c] text-white/60">Carregando…</div>;
  return user ? <Dashboard user={user} /> : <LoginScreen />;
}

function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    setLoading(true);
    signInWithEmailAndPassword(auth, email, password)
      .catch(() => setError("E-mail ou senha incorretos."))
      .finally(() => setLoading(false));
  };

  return (
    <div className="grid min-h-screen place-items-center bg-[#100d0c] px-5">
      <form onSubmit={handleSubmit} className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#171211] p-7">
        <p className="text-xs font-bold uppercase tracking-[.18em] text-[#ff7c50]">Sooba</p>
        <h1 className="mt-1 font-display text-2xl font-extrabold tracking-[-.04em] text-white">Painel administrativo</h1>
        <div className="mt-6 space-y-3">
          <input type="email" required autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="E-mail" className="w-full rounded-xl border border-white/15 bg-white/[0.06] px-3.5 py-2.5 text-sm text-white placeholder:text-white/35 outline-none focus:border-[#ff6b32]" />
          <input type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Senha" className="w-full rounded-xl border border-white/15 bg-white/[0.06] px-3.5 py-2.5 text-sm text-white placeholder:text-white/35 outline-none focus:border-[#ff6b32]" />
        </div>
        {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
        <button type="submit" disabled={loading} className="mt-5 flex w-full items-center justify-center gap-2 rounded-full bg-[#ff5a19] px-4 py-3 text-sm font-bold text-white transition hover:-translate-y-0.5 hover:bg-[#ff6a2e] disabled:cursor-not-allowed disabled:opacity-50">
          {loading ? "Entrando…" : "Entrar"}
        </button>
      </form>
    </div>
  );
}

function Dashboard({ user }: { user: User }) {
  const [orders, setOrders] = useState<OrderRecord[] | null>(null);
  const [error, setError] = useState("");
  const [pickedDate, setPickedDate] = useState(() => toDateInputValue(new Date()));
  const [pickedDayOrders, setPickedDayOrders] = useState<OrderRecord[] | null>(null);
  const [pickedMonthOrders, setPickedMonthOrders] = useState<OrderRecord[] | null>(null);
  const [pickedLoading, setPickedLoading] = useState(false);

  useEffect(() => {
    fetchRecentOrders().then(setOrders).catch(() => setError("Não foi possível carregar os pedidos."));
  }, []);

  useEffect(() => {
    const [year, month, day] = pickedDate.split("-").map(Number);
    if (!year || !month || !day) return;
    const picked = new Date(year, month - 1, day);
    const dayStart = startOfDay(picked);
    const dayEnd = endOfDay(picked);
    const monthStart = startOfMonth(picked);
    const monthEnd = endOfMonth(picked);
    setPickedLoading(true);
    fetchOrdersBetween(monthStart, monthEnd)
      .then((monthOrders) => {
        setPickedMonthOrders(monthOrders);
        setPickedDayOrders(monthOrders.filter((order) => order.createdAt >= dayStart && order.createdAt < dayEnd));
      })
      .catch(() => setError("Não foi possível buscar essa data."))
      .finally(() => setPickedLoading(false));
  }, [pickedDate]);

  if (error) return <div className="grid min-h-screen place-items-center bg-[#100d0c] px-5 text-center text-white/70">{error}</div>;
  if (!orders) return <div className="grid min-h-screen place-items-center bg-[#100d0c] text-white/60">Carregando pedidos…</div>;

  const now = new Date();
  const todayOrders = ordersInRange(orders, startOfDay(now));
  const weekOrders = ordersInRange(orders, startOfWeek(now));
  const monthOrders = ordersInRange(orders, startOfMonth(now));
  const weekdayChart = revenueByWeekday(weekOrders);
  const maxWeekdayValue = Math.max(1, ...weekdayChart.map((bucket) => bucket.total));

  const pickedDateObj = (() => {
    const [year, month, day] = pickedDate.split("-").map(Number);
    return new Date(year, (month || 1) - 1, day || 1);
  })();

  return (
    <div className="min-h-screen bg-[#100d0c] px-5 py-8 text-white sm:px-8">
      <div className="mx-auto max-w-5xl">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[.18em] text-[#ff7c50]">Sooba · Painel</p>
            <h1 className="mt-1 font-display text-3xl font-extrabold tracking-[-.045em]">Olá, {user.email}</h1>
          </div>
          <button type="button" onClick={() => signOut(auth)} className="rounded-full border border-white/15 px-4 py-2 text-xs font-bold text-white/70 transition hover:border-white/35 hover:text-white">Sair</button>
        </div>

        <PeriodSection title="Hoje" orders={todayOrders} />
        <PeriodSection title="Essa semana" orders={weekOrders} />
        <PeriodSection title="Esse mês" orders={monthOrders} monthLabel={now.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })} />

        <div className="mt-10 rounded-2xl border border-[#ff5a19]/25 bg-[#171211] p-6">
          <p className="text-xs font-bold uppercase tracking-[.18em] text-[#ff7c50]">Rever outra data</p>
          <h2 className="mt-1 font-display text-xl font-extrabold tracking-[-.03em]">Pesquisar dia, mês e ano</h2>
          <input type="date" value={pickedDate} onChange={(e) => setPickedDate(e.target.value)} max={toDateInputValue(new Date())} className="mt-4 rounded-xl border border-white/15 bg-white/[0.06] px-3.5 py-2.5 text-sm text-white outline-none focus:border-[#ff6b32]" />
          {pickedLoading ? (
            <p className="mt-4 text-sm text-white/50">Buscando…</p>
          ) : pickedDayOrders && pickedMonthOrders ? (
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                <p className="text-[10px] font-bold uppercase tracking-[.14em] text-white/45">{pickedDateObj.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })}</p>
                <p className="mt-2 font-display text-2xl font-extrabold">{formatTotal(sumRevenue(pickedDayOrders))}</p>
                <p className="mt-1 text-xs text-white/55"><strong className="text-white">{pickedDayOrders.length}</strong> pedido{pickedDayOrders.length === 1 ? "" : "s"} nesse dia</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                <p className="text-[10px] font-bold uppercase tracking-[.14em] text-white/45">{pickedDateObj.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })} (mês inteiro)</p>
                <p className="mt-2 font-display text-2xl font-extrabold">{formatTotal(sumRevenue(pickedMonthOrders))}</p>
                <p className="mt-1 text-xs text-white/55"><strong className="text-white">{pickedMonthOrders.length}</strong> pedido{pickedMonthOrders.length === 1 ? "" : "s"} nesse mês</p>
              </div>
            </div>
          ) : null}
          {!pickedLoading && pickedDayOrders && pickedDayOrders.length > 0 && (
            <div className="mt-5">
              <p className="text-[10px] font-bold uppercase tracking-[.14em] text-white/45">Pedidos desse dia ({pickedDayOrders.length})</p>
              <div className="mt-2 max-h-96 space-y-2 overflow-y-auto rounded-xl border border-white/10 bg-white/[0.03] p-3">
                {[...pickedDayOrders]
                  .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
                  .map((order) => (
                    <div key={order.id} className="rounded-lg border border-white/10 bg-[#171211] p-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-bold text-white">Pedido #{order.orderNumber}</span>
                        <span className="text-xs text-white/45">{order.createdAt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span>
                      </div>
                      <div className="mt-2 space-y-1">
                        {order.items.map((item) => (
                          <div key={item.id} className="flex items-center justify-between text-xs text-white/65">
                            <span>{item.quantity}x {item.name}</span>
                            <span>{formatTotal(item.lineTotal)}</span>
                          </div>
                        ))}
                      </div>
                      <div className="mt-2 flex items-center justify-between border-t border-white/10 pt-2 text-sm font-bold text-[#ff875c]">
                        <span>Total</span>
                        <span>{formatTotal(order.total)}</span>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}

          <div className="mt-6 border-t border-white/10 pt-5">
            <p className="text-[10px] font-bold uppercase tracking-[.14em] text-white/45">Semana atual</p>
            <h3 className="mt-1 text-sm font-bold text-white">Qual dia da semana vendeu mais</h3>
            <div className="mt-5 flex items-end justify-between gap-2 sm:gap-3" style={{ height: "140px" }}>
              {weekdayChart.map((bucket) => (
                <div key={bucket.label} className="flex flex-1 flex-col items-center gap-2">
                  <div className="flex w-full flex-1 items-end justify-center">
                    <div className="w-full max-w-9 rounded-t-md bg-[#ff5a19]" style={{ height: `${Math.max(4, (bucket.total / maxWeekdayValue) * 100)}%` }} title={formatTotal(bucket.total)} />
                  </div>
                  <span className="text-center text-[9px] font-bold uppercase leading-tight text-white/45">{bucket.label.slice(0, 3)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function PeriodSection({ title, orders, monthLabel }: { title: string; orders: OrderRecord[]; monthLabel?: string }) {
  const revenue = sumRevenue(orders);
  const top3 = bestSellers(orders, 3);
  return (
    <div className="mt-8">
      <h2 className="font-display text-xl font-extrabold tracking-[-.03em]">{title}{monthLabel ? <span className="ml-2 text-sm font-medium text-white/40">({monthLabel})</span> : null}</h2>
      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_300px]">
        <div className="grid gap-4 sm:grid-cols-2">
          <StatCard label="Faturamento" value={formatTotal(revenue)} />
          <StatCard label="Pedidos" value={String(orders.length)} highlight />
        </div>
        <div className="rounded-2xl border border-white/10 bg-[#171211] p-5">
          <p className="text-[10px] font-bold uppercase tracking-[.14em] text-white/45">Top 3 mais vendidos</p>
          {top3.length === 0 ? (
            <p className="mt-3 text-sm text-white/50">Sem pedidos ainda.</p>
          ) : (
            <div className="mt-3 space-y-2.5">
              {top3.map((item, index) => (
                <div key={item.name} className="flex items-center gap-3">
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[#ff5a19]/15 text-xs font-extrabold text-[#ff875c]">{index + 1}º</span>
                  <span className="flex-1 truncate text-sm font-bold">{item.name}</span>
                  <span className="shrink-0 text-xs text-white/55">{item.quantity}x</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`rounded-2xl border p-5 ${highlight ? "border-[#ff5a19]/40 bg-[#ff5a19]/10" : "border-white/10 bg-[#171211]"}`}>
      <p className="text-[10px] font-bold uppercase tracking-[.14em] text-white/45">{label}</p>
      <p className={`mt-2 font-display text-3xl font-extrabold tracking-[-.03em] ${highlight ? "text-[#ff875c]" : "text-white"}`}>{value}</p>
    </div>
  );
}

import { useEffect, useState } from "react";
import { onAuthStateChanged, signInWithEmailAndPassword, signOut, type User } from "firebase/auth";
import { auth } from "../firebase";
import { bestSellers, fetchRecentOrders, ordersInRange, revenueByDay, startOfDay, startOfMonth, startOfWeek, sumRevenue, type OrderRecord } from "./adminData";

const formatTotal = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

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

  useEffect(() => {
    fetchRecentOrders().then(setOrders).catch(() => setError("Não foi possível carregar os pedidos."));
  }, []);

  if (error) return <div className="grid min-h-screen place-items-center bg-[#100d0c] px-5 text-center text-white/70">{error}</div>;
  if (!orders) return <div className="grid min-h-screen place-items-center bg-[#100d0c] text-white/60">Carregando pedidos…</div>;

  const now = new Date();
  const todayOrders = ordersInRange(orders, startOfDay(now));
  const weekOrders = ordersInRange(orders, startOfWeek(now));
  const monthOrders = ordersInRange(orders, startOfMonth(now));

  const todayRevenue = sumRevenue(todayOrders);
  const weekRevenue = sumRevenue(weekOrders);
  const monthRevenue = sumRevenue(monthOrders);
  const todayBest = bestSellers(todayOrders, 1)[0];
  const weekBest = bestSellers(weekOrders, 1)[0];
  const monthTop3 = bestSellers(monthOrders, 3);
  const chartData = revenueByDay(orders, 7);
  const maxChartValue = Math.max(1, ...chartData.map((d) => d.total));

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

        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          <StatCard label="Faturamento hoje" value={formatTotal(todayRevenue)} sub={`${todayOrders.length} pedido${todayOrders.length === 1 ? "" : "s"}`} />
          <StatCard label="Faturamento na semana" value={formatTotal(weekRevenue)} sub={`${weekOrders.length} pedido${weekOrders.length === 1 ? "" : "s"}`} />
          <StatCard label="Faturamento no mês" value={formatTotal(monthRevenue)} sub={`${monthOrders.length} pedido${monthOrders.length === 1 ? "" : "s"}`} />
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <StatCard label="Mais vendido hoje" value={todayBest ? todayBest.name : "—"} sub={todayBest ? `${todayBest.quantity}x vendido hoje` : "Nenhum pedido ainda hoje"} />
          <StatCard label="Mais vendido na semana" value={weekBest ? weekBest.name : "—"} sub={weekBest ? `${weekBest.quantity}x vendido essa semana` : "Nenhum pedido ainda essa semana"} />
        </div>

        <div className="mt-8 rounded-2xl border border-white/10 bg-[#171211] p-6">
          <p className="text-xs font-bold uppercase tracking-[.16em] text-[#ff7c50]">Top 3 do mês</p>
          <h2 className="mt-1 font-display text-xl font-extrabold tracking-[-.03em]">Mais vendidos de {now.toLocaleDateString("pt-BR", { month: "long" })}</h2>
          {monthTop3.length === 0 ? <p className="mt-4 text-sm text-white/50">Ainda não tem pedidos esse mês.</p> : (
            <div className="mt-5 space-y-3">
              {monthTop3.map((item, index) => (
                <div key={item.name} className="flex items-center gap-4">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#ff5a19]/15 font-display text-sm font-extrabold text-[#ff875c]">{index + 1}º</span>
                  <span className="flex-1 text-sm font-bold">{item.name}</span>
                  <span className="text-sm text-white/55">{item.quantity}x</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="mt-4 rounded-2xl border border-white/10 bg-[#171211] p-6">
          <p className="text-xs font-bold uppercase tracking-[.16em] text-[#ff7c50]">Últimos 7 dias</p>
          <h2 className="mt-1 font-display text-xl font-extrabold tracking-[-.03em]">Faturamento por dia</h2>
          <div className="mt-6 flex items-end justify-between gap-2 sm:gap-4" style={{ height: "160px" }}>
            {chartData.map((bucket) => (
              <div key={bucket.date.toISOString()} className="flex flex-1 flex-col items-center gap-2">
                <div className="flex w-full flex-1 items-end justify-center">
                  <div className="w-full max-w-10 rounded-t-md bg-[#ff5a19]" style={{ height: `${Math.max(4, (bucket.total / maxChartValue) * 100)}%` }} title={formatTotal(bucket.total)} />
                </div>
                <span className="text-[10px] font-bold uppercase text-white/45">{bucket.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-[#171211] p-5">
      <p className="text-[10px] font-bold uppercase tracking-[.14em] text-white/45">{label}</p>
      <p className="mt-2 font-display text-2xl font-extrabold tracking-[-.03em] text-white">{value}</p>
      <p className="mt-1 text-xs text-white/50">{sub}</p>
    </div>
  );
}

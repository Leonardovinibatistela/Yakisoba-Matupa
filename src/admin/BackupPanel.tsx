import { useState } from "react";
import { backupFileName, isBackupOverdue, ordersToCsv, type BackupDoc, type BackupFile } from "./backupFormat";

const LAST_BACKUP_KEY = "sooba_last_backup_at";

// Onde o aparelho lembra quando foi o último backup (só serve pro lembrete; o arquivo em si vai pra pasta Downloads).
export function readLastBackup(): Date | null {
  try {
    const raw = localStorage.getItem(LAST_BACKUP_KEY);
    const date = raw ? new Date(raw) : null;
    return date && !Number.isNaN(date.getTime()) ? date : null;
  } catch {
    return null;
  }
}
export function saveLastBackup(date: Date): void {
  try { localStorage.setItem(LAST_BACKUP_KEY, date.toISOString()); } catch { /* sem localStorage, tudo bem: só perde o lembrete */ }
}

const COLLECTION_LABELS: Record<string, string> = {
  orders: "Pedidos",
  ingredients: "Ingredientes",
  ingredientPurchases: "Compras de ingredientes",
  fixedExpenses: "Despesas fixas",
  fixedExpenseHistory: "Histórico das despesas",
  stockMovements: "Movimentos de estoque",
  customMenuItems: "Itens de cardápio criados",
  dailyCombos: "Combos do dia",
  carouselImages: "Fotos do carrossel",
  menuStatus: "Ajustes (preços, esgotado, fichas técnicas, taxas…)",
  counters: "Contador de pedidos",
};

function downloadFile(name: string, content: string, mime: string) {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

const formatWhen = (date: Date) => date.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

type Props = {
  lastBackupAt: Date | null;
  loadBackup: (onProgress: (label: string) => void) => Promise<BackupFile>;
  loadOrders: () => Promise<BackupDoc[]>;
  onBackupDone: (when: Date) => void;
};

export default function BackupPanel({ lastBackupAt, loadBackup, loadOrders, onBackupDone }: Props) {
  const [running, setRunning] = useState<"full" | "orders" | null>(null);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<{ fileName: string; counts: Record<string, number> } | null>(null);
  const overdue = isBackupOverdue(lastBackupAt, new Date());

  const runFull = async () => {
    if (running) return;
    setRunning("full");
    setError(null);
    setSummary(null);
    setProgress("Começando…");
    try {
      const backup = await loadBackup((name) => setProgress(`Lendo: ${COLLECTION_LABELS[name] ?? name}…`));
      const fileName = backupFileName(new Date(), "sooba-backup", "json");
      downloadFile(fileName, JSON.stringify(backup, null, 2), "application/json");
      setSummary({ fileName, counts: backup.counts });
      const when = new Date();
      saveLastBackup(when);
      onBackupDone(when);
    } catch {
      setError("Não deu pra ler tudo do banco — confere a internet e tenta de novo. Nada foi baixado.");
    } finally {
      setRunning(null);
      setProgress("");
    }
  };

  const runOrders = async () => {
    if (running) return;
    setRunning("orders");
    setError(null);
    setSummary(null);
    setProgress("Lendo os pedidos…");
    try {
      const orders = await loadOrders();
      downloadFile(backupFileName(new Date(), "sooba-pedidos", "csv"), ordersToCsv(orders), "text/csv;charset=utf-8");
      setProgress(`${orders.length} pedidos na planilha.`);
    } catch {
      setError("Não deu pra ler os pedidos — confere a internet e tenta de novo. Nada foi baixado.");
      setProgress("");
    } finally {
      setRunning(null);
    }
  };

  return (
    <section className="mt-10 rounded-2xl border border-white/10 bg-[#171211] p-4 sm:p-6">
      <p className="text-xs font-bold uppercase tracking-[.18em] text-[#ff7c50]">Backup</p>
      <h2 className="mt-1 font-display text-xl font-extrabold tracking-[-.03em]">Cópia de segurança dos dados</h2>
      <p className="mt-1.5 text-sm text-white/55">Baixa um arquivo com tudo que está no sistema: pedidos, estoque, fichas técnicas, despesas e ajustes do cardápio. Guarde no Google Drive. Recomendo baixar <strong className="text-white/80">uma vez por semana</strong>.</p>

      <div className={`mt-4 rounded-xl border px-4 py-3 text-sm ${overdue ? "border-amber-400/40 bg-amber-400/10 text-amber-200" : "border-emerald-400/30 bg-emerald-400/10 text-emerald-200"}`}>
        {lastBackupAt ? <>Último backup baixado <strong>neste aparelho</strong>: {formatWhen(lastBackupAt)}.{overdue ? " Já faz mais de 7 dias — baixa um novo." : ""}</> : <>Nenhum backup foi baixado <strong>neste aparelho</strong> ainda. Baixa o primeiro agora.</>}
      </div>

      <div className="mt-4 flex flex-wrap gap-3">
        <button type="button" onClick={runFull} disabled={running !== null} className="min-h-[44px] rounded-full bg-[#ff5a19] px-5 py-2.5 text-sm font-bold text-white transition hover:bg-[#ff6a2e] disabled:cursor-wait disabled:opacity-60">{running === "full" ? "Baixando…" : "💾 Baixar backup completo"}</button>
        <button type="button" onClick={runOrders} disabled={running !== null} className="min-h-[44px] rounded-full border border-white/20 px-5 py-2.5 text-sm font-bold text-white/85 transition hover:border-white/40 hover:text-white disabled:cursor-wait disabled:opacity-60">{running === "orders" ? "Baixando…" : "📊 Baixar todos os pedidos (Excel)"}</button>
      </div>

      {progress && <p role="status" className="mt-3 text-sm text-white/60">{progress}</p>}
      {error && <p role="alert" className="mt-3 text-sm font-semibold text-red-400">{error}</p>}

      {summary && (
        <div role="status" className="mt-4 rounded-xl border border-emerald-400/30 bg-emerald-400/5 p-4">
          <p className="text-sm font-bold text-emerald-300">✓ Backup baixado: {summary.fileName}</p>
          <ul className="mt-2 grid gap-x-6 gap-y-1 text-xs text-white/65 sm:grid-cols-2">
            {Object.entries(summary.counts).map(([name, count]) => <li key={name} className="flex justify-between gap-3"><span>{COLLECTION_LABELS[name] ?? name}</span><span className="tabular-nums font-bold text-white/85">{count}</span></li>)}
          </ul>
          <p className="mt-3 text-xs text-white/45">Confira se o arquivo foi pra pasta Downloads e guarde uma cópia no Google Drive.</p>
        </div>
      )}

      <ul className="mt-5 space-y-1.5 text-xs leading-relaxed text-white/45">
        <li>⚠️ O arquivo tem <strong className="text-white/65">nome, telefone e endereço dos clientes</strong> e não tem senha. Guarde num lugar privado e não mande por WhatsApp.</li>
        <li>Cada backup lê o banco (1 leitura por registro). Uma vez por semana cabe folgado no plano grátis.</li>
        <li>O backup só <strong className="text-white/65">lê</strong>: não apaga nem altera nada no sistema.</li>
      </ul>
    </section>
  );
}

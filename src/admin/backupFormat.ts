// Só formato — nada de tela nem de Firebase aqui, pra dar pra testar sozinho.

export type BackupDoc = { id: string; data: Record<string, unknown> };

export type BackupFile = {
  app: "sooba-backup";
  version: 1;
  projectId: string;
  exportedAt: string;
  /** quantos registros de cada coleção */
  counts: Record<string, number>;
  collections: Record<string, BackupDoc[]>;
};

/**
 * Valor do Firestore → JSON. Data (Timestamp) vira { "__timestamp": "2026-09-24T17:00:00.000Z" }, que dá
 * pra reconhecer e converter de volta se um dia precisar restaurar. O resto (texto, número, lista, objeto) segue igual.
 */
export function serializeValue(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (typeof value === "object") {
    const maybeDate = value as { toDate?: () => Date };
    if (typeof maybeDate.toDate === "function") return { __timestamp: maybeDate.toDate().toISOString() };
    if (Array.isArray(value)) return value.map(serializeValue);
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, inner]) => [key, serializeValue(inner)]));
  }
  return value;
}

export function buildBackup(projectId: string, exportedAt: Date, collections: Record<string, BackupDoc[]>): BackupFile {
  const counts: Record<string, number> = {};
  Object.entries(collections).forEach(([name, docs]) => { counts[name] = docs.length; });
  return { app: "sooba-backup", version: 1, projectId, exportedAt: exportedAt.toISOString(), counts, collections };
}

const pad = (value: number) => String(value).padStart(2, "0");

/** sooba-backup-2026-09-24_1430.json (hora local, pra ordenar certo na pasta) */
export const backupFileName = (date: Date, prefix: string, extension: string): string =>
  `${prefix}-${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}_${pad(date.getHours())}${pad(date.getMinutes())}.${extension}`;

/** Passou de `maxDays` dias desde o último backup (ou nunca fez)? */
export function isBackupOverdue(last: Date | null, now: Date, maxDays = 7): boolean {
  if (!last) return true;
  return now.getTime() - last.getTime() > maxDays * 24 * 60 * 60 * 1000;
}

const timestampOf = (value: unknown): Date | null => {
  const iso = (value as { __timestamp?: string } | null | undefined)?.__timestamp;
  if (!iso) return null;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
};

// Excel em português usa ; entre colunas e vírgula nos decimais.
const csvCell = (value: string): string => (/[;"\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);
const money = (value: unknown): string => (typeof value === "number" && Number.isFinite(value) ? value.toFixed(2).replace(".", ",") : "");
const text = (value: unknown): string => (typeof value === "string" ? value : "");

const DELIVERY_LABELS: Record<string, string> = { entrega: "Entrega", retirada: "Retirada" };
const PAYMENT_LABELS: Record<string, string> = { pix: "Pix", cartao: "Cartão", dinheiro: "Dinheiro" };
export const ORDER_CSV_HEADERS = ["Pedido", "Data", "Hora", "Cliente", "Telefone", "Tipo", "Endereço", "Pagamento", "Itens", "Subtotal", "Taxa de entrega", "Total", "Custo dos ingredientes", "Observação"];

/** Todos os pedidos numa planilha (abre direto no Excel, com acento certo), do mais antigo pro mais novo. */
export function ordersToCsv(orders: BackupDoc[]): string {
  const rows = orders
    .map((order) => ({ order, date: timestampOf(order.data.createdAt) }))
    .sort((a, b) => (a.date?.getTime() ?? 0) - (b.date?.getTime() ?? 0))
    .map(({ order, date }) => {
      const data = order.data;
      const items = Array.isArray(data.items)
        ? (data.items as Record<string, unknown>[]).map((item) => `${typeof item.quantity === "number" ? item.quantity : 1}x ${text(item.name)}`).join(" | ")
        : "";
      return [
        typeof data.orderNumber === "number" ? String(data.orderNumber) : "",
        date ? `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}` : "",
        date ? `${pad(date.getHours())}:${pad(date.getMinutes())}` : "",
        text(data.customerName),
        text(data.customerPhone),
        DELIVERY_LABELS[text(data.deliveryType)] ?? "",
        text(data.location),
        PAYMENT_LABELS[text(data.paymentMethod)] ?? "",
        items,
        money(data.subtotal),
        money(data.deliveryFee),
        money(data.total),
        money(data.ingredientCost),
        text(data.notes),
      ].map(csvCell).join(";");
    });
  return "﻿" + [ORDER_CSV_HEADERS.join(";"), ...rows].join("\r\n") + "\r\n";
}

// Layout do recibo impresso (só regra — nada de Bluetooth aqui, pra dar pra testar sem a impressora).
// Modelo pedido pela loja: "ENTREGAR" grande em cima, dados da loja, PREVISTO PARA / PEDIDO AS / FEITO POR,
// NOME / FONE / END., itens em fundo preto (QTD, produto, valor), PRODUTOS / ENTREGA / TOTAL e o pagamento.
// O printer.ts transforma estas linhas em comandos ESC/POS.
import type { OrderRecord } from "./adminData";

/** Colunas de texto numa impressora térmica de 58mm, fonte padrão (letra maior ocupa mais colunas por caractere). */
export const LINE_WIDTH = 32;
export const STORE_NAME = "SOOBA YAKISOBA E SUSHI";
export const STORE_PHONE = "(66) 99202-6783";
export const STORE_CNPJ = "62.321.249/0001-56";
/** Minutos entre a hora do pedido e o "PREVISTO PARA" impresso. */
export const ESTIMATED_MINUTES = { entrega: 45, retirada: 45 } as const;
/** Horário de Matupá (UTC-4, sem horário de verão): o recibo sai sempre nele, não no fuso do computador que imprime. */
const STORE_OFFSET_MINUTES = 240;

export type ReceiptPart = { text: string; bold?: boolean; reverse?: boolean };
/** w/h = tamanho da letra (1 = normal, 2 = dobro...). reverse = letra branca em fundo preto. */
export type ReceiptLine = { parts: ReceiptPart[]; align: "left" | "center" | "right"; w: number; h: number };

/** Impressora barata não entende acento/UTF-8: tira o acento, troca º por o etc., descarta o resto e deixa em MAIÚSCULO. */
export const toPrinterText = (text: string) => text.replace(/[–—]/g, "-").replace(/[‘’]/g, "'").replace(/[“”]/g, "\"").normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^\x20-\x7E]/g, "").toUpperCase();

const pad2 = (value: number) => String(value).padStart(2, "0");
const money = (value: number) => value.toFixed(2).replace(".", ",");

function storeParts(ms: number) {
  const d = new Date(ms - STORE_OFFSET_MINUTES * 60000);
  return { day: pad2(d.getUTCDate()), month: pad2(d.getUTCMonth() + 1), year: pad2(d.getUTCFullYear() % 100), hour: pad2(d.getUTCHours()), minute: pad2(d.getUTCMinutes()) };
}
const storeTime = (ms: number) => { const p = storeParts(ms); return `${p.hour}:${p.minute}`; };
const storeDateTime = (ms: number) => { const p = storeParts(ms); return `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}`; };

/** Quebra em linhas de até `width` colunas, sem cortar palavra no meio (palavra maior que a linha é cortada). */
export function wrapText(text: string, width: number): string[] {
  const lines: string[] = [];
  let current = "";
  for (let word of toPrinterText(text).split(/\s+/).filter(Boolean)) {
    while (word.length > width) {
      if (current) { lines.push(current); current = ""; }
      lines.push(word.slice(0, width));
      word = word.slice(width);
    }
    if (!current) current = word;
    else if (current.length + 1 + word.length <= width) current += " " + word;
    else { lines.push(current); current = word; }
  }
  if (current) lines.push(current);
  return lines.length > 0 ? lines : [""];
}

type LineOptions = { align?: ReceiptLine["align"]; w?: number; h?: number; bold?: boolean; reverse?: boolean };
const line = (text: string, o: LineOptions = {}): ReceiptLine => ({ parts: [{ text: toPrinterText(text), bold: o.bold, reverse: o.reverse }], align: o.align ?? "left", w: o.w ?? 1, h: o.h ?? 1 });
const columnsOf = (l: Pick<ReceiptLine, "w">) => Math.floor(LINE_WIDTH / l.w);
const divider = (): ReceiptLine => line("-".repeat(LINE_WIDTH));
const blank = (): ReceiptLine => line("");

/** Texto à esquerda e valor à direita na mesma linha; se não couber, o texto quebra e o valor vai sozinho à direita. */
function leftRight(left: string, right: string, o: LineOptions = {}): ReceiptLine[] {
  const cols = columnsOf({ w: o.w ?? 1 });
  const l = toPrinterText(left);
  const r = toPrinterText(right);
  if (l.length + 1 + r.length <= cols) return [line(l + " ".repeat(cols - l.length - r.length) + r, o)];
  return [...wrapText(l, cols).map((text) => line(text, o)), line(r, { ...o, align: "right" })];
}

/** Linha de produto: nome em fundo preto (letra branca) e o valor à direita. */
function productRows(label: string, price: string): ReceiptLine[] {
  const text = toPrinterText(label);
  if (text.length + 1 + price.length <= LINE_WIDTH) {
    return [{ parts: [{ text, reverse: true, bold: true }, { text: " ".repeat(LINE_WIDTH - text.length - price.length) + price }], align: "left", w: 1, h: 1 }];
  }
  return [...wrapText(text, LINE_WIDTH).map((part) => line(part, { reverse: true, bold: true })), line(price, { align: "right" })];
}

/** Separa as observações gravadas no pedido em: quem fez (pedido manual), talher/adaptador e a observação em si. */
export function parseOrderNotes(notes: string): { madeBy: string | null; cutlery: string | null; adapter: boolean; obs: string } {
  let madeBy: string | null = null;
  let cutlery: string | null = null;
  let adapter = false;
  const rest: string[] = [];
  notes.split(" | ").map((part) => part.trim()).filter(Boolean).forEach((part) => {
    const manual = /^PEDIDO MANUAL \((.+)\)$/i.exec(part);
    const talher = /^Talher:\s*(.+)$/i.exec(part);
    if (manual) madeBy = manual[1];
    else if (talher) cutlery = talher[1];
    else if (/^ADAPTADOR DE HASHI:\s*SIM$/i.test(part)) adapter = true;
    else rest.push(part);
  });
  return { madeBy, cutlery, adapter, obs: rest.join(" | ") };
}

const CUTLERY_LABEL: Record<string, string> = { hashi: "HASHI", garfo: "GARFO", nenhum: "SEM TALHER" };
const PAYMENT_LABELS: Record<string, string> = { pix: "PIX", cartao: "CREDITO", debito: "DEBITO", dinheiro: "DINHEIRO" };

/** Texto com rótulo na frente ("END.: ..."): as linhas seguintes ficam alinhadas com o começo do texto, sem passar da largura. */
function hangingLines(prefix: string, text: string): string[] {
  return wrapText(text, LINE_WIDTH - prefix.length).map((part, index) => (index === 0 ? prefix : " ".repeat(prefix.length)) + part);
}

/** Monta o recibo do pedido como uma lista de linhas formatadas. */
export function buildReceiptLines(order: OrderRecord): ReceiptLine[] {
  const lines: ReceiptLine[] = [];
  const delivery = order.deliveryType === "entrega";
  const pickup = order.deliveryType === "retirada";
  const notes = parseOrderNotes(order.notes ?? "");
  const createdMs = order.createdAt.getTime();

  // Cabeçalho: ENTREGAR / RETIRAR gigante (o entregador e o balcão enxergam de longe) e dados da loja.
  if (delivery || pickup) lines.push(line(delivery ? "ENTREGAR" : "RETIRAR", { align: "center", w: 3, h: 2, bold: true }), blank());
  lines.push(line(STORE_NAME, { align: "center", bold: true }), line(`FONE: ${STORE_PHONE}`, { align: "center" }), line(`CNPJ: ${STORE_CNPJ}`, { align: "center" }), divider());

  // Pedido, hora prevista, hora do pedido e quem fez.
  lines.push(line(`PEDIDO #${order.orderNumber}`, { align: "center", w: 2, h: 2, bold: true }));
  if (delivery || pickup) lines.push(line(`PREVISTO PARA ${storeTime(createdMs + ESTIMATED_MINUTES[delivery ? "entrega" : "retirada"] * 60000)}`, { align: "center", bold: true }));
  lines.push(line(`PEDIDO AS: ${storeDateTime(createdMs)}`), line(`FEITO POR: ${notes.madeBy ? notes.madeBy : "SITE"}`), divider());

  // Cliente.
  const name = (order.customerName ?? "").trim();
  const phone = (order.customerPhone ?? "").trim();
  if (name || phone) {
    lines.push(line(`NOME: ${name || "-"}`, { bold: true }));
    if (phone && phone !== "-") lines.push(line(`FONE: ${phone}`));
  }
  const address = (order.location ?? "").trim();
  if (delivery && address) hangingLines("END.: ", address).forEach((text) => lines.push(line(text, { bold: true })));
  if (name || phone || (delivery && address)) lines.push(divider());

  // Talher / adaptador / observação.
  const cutlery = order.cutlery ? CUTLERY_LABEL[order.cutlery] : notes.cutlery ? toPrinterText(notes.cutlery) : null;
  const extras: ReceiptLine[] = [];
  if (cutlery) extras.push(line(`TALHER: ${cutlery}`, { bold: true }));
  if (notes.adapter) extras.push(line("** ADAPTADOR DE HASHI: SIM **", { bold: true, reverse: true }));
  if (notes.obs) wrapText(`OBS: ${notes.obs}`, LINE_WIDTH).forEach((text) => extras.push(line(text, { bold: true })));
  if (extras.length > 0) lines.push(...extras, divider());

  // Itens.
  lines.push(...leftRight("QTD  PRODUTOS", "VALOR", { bold: true }));
  order.items.forEach((item) => {
    const label = `${item.quantity}X ${item.name}`;
    if (item.parentId) lines.push(...leftRight(`  + ${label}`, money(item.lineTotal)));
    else lines.push(...productRows(label, money(item.lineTotal)));
  });
  lines.push(divider());

  // Totais e pagamento.
  const productCount = order.items.filter((item) => !item.parentId).reduce((sum, item) => sum + item.quantity, 0);
  const fee = order.deliveryFee ?? 0;
  lines.push(...leftRight(`PRODUTOS (${productCount})`, money(order.total - fee)));
  if (delivery) lines.push(...leftRight("ENTREGA", money(fee)));
  lines.push(...leftRight("TOTAL", money(order.total), { w: 2, h: 2, bold: true }));
  if (order.paymentMethod) lines.push(line(`PAGAMENTO: ${PAYMENT_LABELS[order.paymentMethod] ?? order.paymentMethod}`, { bold: true }));
  return lines;
}

/** Prévia em texto (pra conferir o desenho do recibo sem gastar papel): fundo preto vira [ ], letra grande aparece com <w x h>. */
export function receiptPreviewText(lines: ReceiptLine[]): string {
  return lines
    .map((l) => {
      const text = l.parts.map((part) => (part.reverse ? `[${part.text}]` : part.text)).join("");
      const visible = l.parts.reduce((sum, part) => sum + part.text.length, 0);
      const cols = columnsOf(l);
      const indent = l.align === "center" ? Math.max(0, Math.floor((cols - visible) / 2)) : l.align === "right" ? Math.max(0, cols - visible) : 0;
      const tag = l.w > 1 || l.h > 1 ? `  <${l.w}x${l.h}>` : "";
      return " ".repeat(indent) + text + tag;
    })
    .join("\n");
}

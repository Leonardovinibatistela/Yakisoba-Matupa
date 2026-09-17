import type { OrderRecord } from "./adminData";

// Impressão térmica (ESC/POS) via Web Bluetooth, direto do navegador — sem
// precisar instalar nenhum programa. Só funciona no Chrome (Windows/Android);
// o Safari/iPhone não deixa nenhum site acessar Bluetooth, de jeito nenhum.
//
// Não temos como testar contra a impressora física daqui — os comandos
// abaixo seguem o padrão ESC/POS que praticamente toda impressora térmica
// barata de 58mm usa (esse é o mesmo "idioma" usado por milhares de modelos
// clones vendidos sob nomes diferentes). Se na hora de conectar/imprimir der
// algum erro, a mensagem de erro real aparece na tela — me manda o que
// aparecer que eu ajusto.

// Tipagem mínima do Web Bluetooth (não vem no TypeScript padrão, e não
// queremos depender de um pacote extra só pra isso).
interface BleCharacteristic {
  properties: { write: boolean; writeWithoutResponse: boolean };
  writeValue(value: BufferSource): Promise<void>;
  writeValueWithoutResponse(value: BufferSource): Promise<void>;
}
interface BleService {
  getCharacteristics(): Promise<BleCharacteristic[]>;
}
interface BleServer {
  connect(): Promise<BleServer>;
  getPrimaryService(uuid: string): Promise<BleService>;
  connected: boolean;
  disconnect(): void;
}
interface BleDevice {
  name?: string;
  gatt?: BleServer;
  addEventListener(type: "gattserverdisconnected", listener: () => void): void;
}
declare global {
  interface Navigator {
    bluetooth?: {
      requestDevice(options: { acceptAllDevices?: boolean; optionalServices?: string[] }): Promise<BleDevice>;
    };
  }
}

export type PrinterConnection = { device: BleDevice; characteristic: BleCharacteristic };

// UUIDs de serviço Bluetooth mais comuns entre impressoras térmicas baratas
// (cada fabricante de chip usa um diferente — tentamos todos os conhecidos).
const CANDIDATE_SERVICES = [
  "000018f0-0000-1000-8000-00805f9b34fb",
  "0000ff00-0000-1000-8000-00805f9b34fb",
  "0000fff0-0000-1000-8000-00805f9b34fb",
  "49535343-fe7d-4ae5-8fa9-9fafd205e455",
  "e7810a71-73ae-499d-8c15-faa9aef0c3f2",
];

/** Abre o seletor de dispositivo Bluetooth do navegador e conecta na impressora escolhida. */
export async function connectPrinter(): Promise<PrinterConnection> {
  if (!navigator.bluetooth) {
    throw new Error("Esse navegador não tem suporte a Bluetooth. Use o Chrome no computador ou no Android (não funciona no iPhone/Safari).");
  }
  const device = await navigator.bluetooth.requestDevice({ acceptAllDevices: true, optionalServices: CANDIDATE_SERVICES });
  if (!device.gatt) throw new Error("Esse dispositivo não respondeu como uma impressora Bluetooth.");
  const server = await device.gatt.connect();
  for (const uuid of CANDIDATE_SERVICES) {
    try {
      const service = await server.getPrimaryService(uuid);
      const characteristics = await service.getCharacteristics();
      const writable = characteristics.find((c) => c.properties.write || c.properties.writeWithoutResponse);
      if (writable) return { device, characteristic: writable };
    } catch {
      // Esse serviço não existe nesse aparelho — tenta o próximo candidato.
    }
  }
  throw new Error("Conectou no Bluetooth, mas não achei como enviar dados de impressão pra esse modelo. Pode ser um protocolo diferente do esperado.");
}

// --- Comandos ESC/POS ---
const ESC = 0x1b;
const GS = 0x1d;
const CMD_INIT = [ESC, 0x40];
const CMD_ALIGN_CENTER = [ESC, 0x61, 0x01];
const CMD_ALIGN_LEFT = [ESC, 0x61, 0x00];
const CMD_BOLD_ON = [ESC, 0x45, 0x01];
const CMD_BOLD_OFF = [ESC, 0x45, 0x00];
const CMD_DOUBLE_ON = [GS, 0x21, 0x11];
const CMD_DOUBLE_OFF = [GS, 0x21, 0x00];
const CMD_CUT = [GS, 0x56, 0x00];
const LINE_WIDTH = 32; // colunas de texto numa impressora térmica de 58mm, fonte padrão
const SOOBA_CNPJ = "62.321.249/0001-56";

/** Tira acento (impressora térmica barata não entende UTF-8/acentuação). */
const stripAccents = (text: string) => text.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\x00-\x7F]/g, "");

const textBytes = (text: string): number[] => Array.from(stripAccents(text)).map((char) => char.charCodeAt(0) & 0xff);

const divider = (): number[] => [...textBytes("-".repeat(LINE_WIDTH)), 0x0a];

/** Uma linha com texto à esquerda e à direita, tipo "2x Yakisoba ... R$36,90". */
function row(left: string, right: string): number[] {
  const leftText = stripAccents(left);
  const rightText = stripAccents(right);
  const bytes: number[] = [];
  if (leftText.length + 1 + rightText.length > LINE_WIDTH) {
    // Nome comprido: quebra em duas linhas — nome em cima, valor embaixo à direita.
    bytes.push(...textBytes(leftText), 0x0a);
    const pad = Math.max(0, LINE_WIDTH - rightText.length);
    bytes.push(...textBytes(" ".repeat(pad) + rightText), 0x0a);
  } else {
    const pad = LINE_WIDTH - leftText.length - rightText.length;
    bytes.push(...textBytes(leftText + " ".repeat(pad) + rightText), 0x0a);
  }
  return bytes;
}

const formatTotal = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const PAYMENT_LABELS: Record<string, string> = { pix: "Pix", cartao: "Cartao", dinheiro: "Dinheiro" };

/** Monta o recibo do pedido em bytes ESC/POS, prontos pra mandar pra impressora. */
export function buildReceiptBytes(order: OrderRecord): Uint8Array {
  const bytes: number[] = [];
  bytes.push(...CMD_INIT);
  bytes.push(...CMD_ALIGN_CENTER, ...CMD_BOLD_ON, ...CMD_DOUBLE_ON, ...textBytes("SOOBA"), 0x0a, ...CMD_DOUBLE_OFF);
  bytes.push(...textBytes("Yakisoba e Sushi"), 0x0a, ...CMD_BOLD_OFF);
  bytes.push(...textBytes(`CNPJ: ${SOOBA_CNPJ}`), 0x0a);
  bytes.push(...CMD_BOLD_ON, ...textBytes(`Pedido #${order.orderNumber}`), 0x0a, ...CMD_BOLD_OFF);
  bytes.push(...textBytes(order.createdAt.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })), 0x0a);
  bytes.push(...CMD_ALIGN_LEFT);
  bytes.push(...divider());
  if (order.customerName || order.customerPhone) {
    bytes.push(...textBytes("Cliente: "), ...CMD_BOLD_ON, ...textBytes(order.customerName || "-"), ...CMD_BOLD_OFF, 0x0a);
    if (order.customerPhone) bytes.push(...textBytes(`Whats: ${order.customerPhone}`), 0x0a);
    bytes.push(...divider());
  }
  if (order.deliveryType === "entrega") {
    bytes.push(...CMD_BOLD_ON, ...textBytes("ENTREGA"), 0x0a, ...CMD_BOLD_OFF);
    const location = order.location.trim();
    if (location) bytes.push(...textBytes(location), 0x0a);
    bytes.push(...divider());
  } else if (order.deliveryType === "retirada") {
    bytes.push(...CMD_BOLD_ON, ...textBytes("RETIRADA NO LOCAL"), 0x0a, ...CMD_BOLD_OFF);
    bytes.push(...divider());
  }
  if (order.notes.trim()) {
    bytes.push(...CMD_BOLD_ON, ...textBytes("OBSERVACAO:"), 0x0a, ...textBytes(order.notes.trim()), 0x0a, ...CMD_BOLD_OFF);
    bytes.push(...divider());
  }
  order.items.forEach((item) => {
    bytes.push(...row(`${item.quantity}x ${item.name}`, formatTotal(item.lineTotal)));
  });
  bytes.push(...divider());
  bytes.push(...CMD_BOLD_ON, ...row("TOTAL", formatTotal(order.total)), ...CMD_BOLD_OFF);
  if (order.paymentMethod) bytes.push(...row("Pagamento:", PAYMENT_LABELS[order.paymentMethod] ?? order.paymentMethod));
  bytes.push(0x0a, 0x0a, 0x0a);
  bytes.push(...CMD_CUT);
  return new Uint8Array(bytes);
}

/** Manda os bytes pra impressora em pedaços pequenos (Bluetooth não aceita tudo de uma vez). */
export async function sendBytes(characteristic: BleCharacteristic, bytes: Uint8Array): Promise<void> {
  const CHUNK_SIZE = 180;
  for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
    const chunk = bytes.slice(i, i + CHUNK_SIZE);
    if (characteristic.properties.writeWithoutResponse) await characteristic.writeValueWithoutResponse(chunk);
    else await characteristic.writeValue(chunk);
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

/** Imprime um pedido — monta o recibo e já manda pra impressora conectada. */
export async function printOrder(characteristic: BleCharacteristic, order: OrderRecord): Promise<void> {
  await sendBytes(characteristic, buildReceiptBytes(order));
}

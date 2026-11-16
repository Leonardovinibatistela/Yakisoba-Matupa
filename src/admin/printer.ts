import type { OrderRecord } from "./adminData";
import { LINE_WIDTH, buildReceiptLines, toPrinterText } from "./receiptLayout";

// Impressão térmica (ESC/POS) direto do navegador, sem instalar programa de impressão:
//  - por Bluetooth (impressora de 58mm), via Web Bluetooth;
//  - por USB (impressora de 80mm, ex.: POS80), via WebUSB.
// Só funciona no Chrome (Windows/Mac/Android); o Safari/iPhone não deixa nenhum site acessar Bluetooth nem USB, de jeito nenhum.
//
// Não temos como testar contra a impressora física daqui — os comandos
// abaixo seguem o padrão ESC/POS que praticamente toda impressora térmica
// barata usa (esse é o mesmo "idioma" usado por milhares de modelos
// clones vendidos sob nomes diferentes). Se na hora de conectar/imprimir der
// algum erro, a mensagem de erro real aparece na tela — me manda o que
// aparecer que eu ajusto.

// Tipagem mínima do Web Bluetooth e do WebUSB (não vêm no TypeScript padrão, e não
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
export interface UsbEndpoint { endpointNumber: number; direction: "in" | "out"; type: "bulk" | "interrupt" | "isochronous"; packetSize: number }
export interface UsbAlternate { alternateSetting: number; interfaceClass: number; endpoints: UsbEndpoint[] }
export interface UsbInterface { interfaceNumber: number; alternates: UsbAlternate[]; alternate: UsbAlternate | null }
export interface UsbConfiguration { configurationValue: number; interfaces: UsbInterface[] }
export interface UsbDevice {
  vendorId: number;
  productId: number;
  productName?: string;
  configuration: UsbConfiguration | null;
  configurations: UsbConfiguration[];
  open(): Promise<void>;
  close(): Promise<void>;
  selectConfiguration(configurationValue: number): Promise<void>;
  claimInterface(interfaceNumber: number): Promise<void>;
  releaseInterface(interfaceNumber: number): Promise<void>;
  selectAlternateInterface(interfaceNumber: number, alternateSetting: number): Promise<void>;
  transferOut(endpointNumber: number, data: BufferSource): Promise<{ status: "ok" | "stall" | "babble"; bytesWritten: number }>;
}
interface UsbApi {
  requestDevice(options: { filters: { vendorId?: number; productId?: number; classCode?: number }[] }): Promise<UsbDevice>;
  getDevices(): Promise<UsbDevice[]>;
  addEventListener(type: "connect" | "disconnect", listener: (event: { device: UsbDevice }) => void): void;
  removeEventListener(type: "connect" | "disconnect", listener: (event: { device: UsbDevice }) => void): void;
}
declare global {
  interface Navigator {
    bluetooth?: {
      requestDevice(options: { acceptAllDevices?: boolean; optionalServices?: string[] }): Promise<BleDevice>;
    };
    usb?: UsbApi;
  }
}

/** Por onde os bytes saem (Bluetooth ou USB): quem imprime não precisa saber qual. */
export type PrinterOutput = { write(bytes: Uint8Array): Promise<void> };
export type PrinterConnection = {
  kind: "ble" | "usb";
  name?: string;
  output: PrinterOutput;
  /** Avisa quando a impressora some (desligou, cabo saiu, saiu do alcance). */
  onDisconnect(listener: () => void): void;
};

// ---------------------------------------------------------------------------------------------------------------------
// Bluetooth (58mm)
// ---------------------------------------------------------------------------------------------------------------------

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
      if (writable) {
        return {
          kind: "ble",
          name: device.name,
          output: { write: (bytes) => sendBytes(writable, bytes) },
          onDisconnect: (listener) => device.addEventListener("gattserverdisconnected", listener),
        };
      }
    } catch {
      // Esse serviço não existe nesse aparelho — tenta o próximo candidato.
    }
  }
  throw new Error("Conectou no Bluetooth, mas não achei como enviar dados de impressão pra esse modelo. Pode ser um protocolo diferente do esperado.");
}

/** Manda os bytes pra impressora em pedaços pequenos (Bluetooth não aceita tudo de uma vez). */
async function sendBytes(characteristic: BleCharacteristic, bytes: Uint8Array): Promise<void> {
  const CHUNK_SIZE = 180;
  for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
    const chunk = bytes.slice(i, i + CHUNK_SIZE);
    if (characteristic.properties.writeWithoutResponse) await characteristic.writeValueWithoutResponse(chunk);
    else await characteristic.writeValue(chunk);
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// USB (80mm) — WebUSB. No Windows o navegador só consegue falar com a impressora se ela estiver com o driver "WinUSB"
// (troca feita uma única vez, com o programa Zadig). No Android funciona direto, com cabo OTG.
// ---------------------------------------------------------------------------------------------------------------------

const USB_PRINTER_CLASS = 0x07;
/** Qualquer coisa que se apresente como impressora USB, e os chips Winbond (0x0416) das POS-80 genéricas. */
const USB_FILTERS = [{ classCode: USB_PRINTER_CLASS }, { vendorId: 0x0416 }];
/** Papel de 80mm = 576 pontos = 48 colunas de letra normal (12 pontos cada): o recibo ocupa o papel inteiro. */
export const USB_PAPER_DOTS = 576;
export const USB_COLUMNS = 48;
const DOTS_PER_COLUMN = 12;
const USB_CHUNK_SIZE = 4096;
/** Linhas em branco a mais antes do corte no papel de 80mm: a lâmina fica uns 2cm depois da cabeça de impressão e senão cortaria as últimas linhas. */
export const USB_EXTRA_FEED_LINES = 4;

const USB_DRIVER_HELP =
  "O Windows está usando essa impressora com o driver dele, então o navegador não consegue falar com ela. " +
  "É preciso trocar o driver dessa impressora por \"WinUSB\" uma única vez, com o programa Zadig (zadig.akeo.ie): " +
  "abrir como administrador > Options > List All Devices > escolher a impressora > driver WinUSB > Replace Driver. " +
  "Depois é só conectar de novo aqui.";

export type UsbPrinterPort = { interfaceNumber: number; alternateSetting: number; endpointNumber: number };

/** Acha, nos descritores do aparelho, a interface de impressora e o endpoint de saída (bulk OUT) por onde vão os dados. */
export function findUsbPrinterPort(configuration: UsbConfiguration | null): UsbPrinterPort | null {
  if (!configuration) return null;
  let fallback: UsbPrinterPort | null = null;
  for (const usbInterface of configuration.interfaces) {
    for (const alternate of usbInterface.alternates) {
      const out = alternate.endpoints.find((endpoint) => endpoint.direction === "out" && endpoint.type === "bulk");
      if (!out) continue;
      const port = { interfaceNumber: usbInterface.interfaceNumber, alternateSetting: alternate.alternateSetting, endpointNumber: out.endpointNumber };
      if (alternate.interfaceClass === USB_PRINTER_CLASS) return port;
      fallback ??= port;
    }
  }
  return fallback;
}

/** Abre o aparelho USB já escolhido e deixa pronto pra imprimir. */
export async function openUsbPrinter(device: UsbDevice): Promise<PrinterConnection> {
  try {
    await device.open();
    if (!device.configuration) await device.selectConfiguration(device.configurations[0]?.configurationValue ?? 1);
  } catch (error) {
    throw new Error(`Não consegui abrir a impressora USB. ${USB_DRIVER_HELP}\n\n(${(error as Error)?.message ?? error})`);
  }
  const port = findUsbPrinterPort(device.configuration);
  if (!port) {
    await device.close().catch(() => undefined);
    throw new Error("Abri a impressora USB, mas não achei por onde mandar os dados de impressão. Pode ser um modelo diferente do esperado.");
  }
  try {
    await device.claimInterface(port.interfaceNumber);
    const current = device.configuration?.interfaces.find((usbInterface) => usbInterface.interfaceNumber === port.interfaceNumber)?.alternate;
    if (current && current.alternateSetting !== port.alternateSetting) await device.selectAlternateInterface(port.interfaceNumber, port.alternateSetting);
  } catch (error) {
    await device.close().catch(() => undefined);
    throw new Error(`Não consegui assumir a impressora USB. ${USB_DRIVER_HELP}\n\n(${(error as Error)?.message ?? error})`);
  }
  void loadReceiptFooter(); // já baixa o rodapé (personagem) pra o primeiro pedido não esperar
  return {
    kind: "usb",
    name: device.productName || "USB",
    output: {
      write: async (bytes) => {
        for (let i = 0; i < bytes.length; i += USB_CHUNK_SIZE) {
          const result = await device.transferOut(port.endpointNumber, bytes.slice(i, i + USB_CHUNK_SIZE));
          if (result.status !== "ok") throw new Error(`A impressora USB recusou os dados (${result.status}). Confira se está ligada e com papel.`);
        }
      },
    },
    onDisconnect: (listener) => navigator.usb?.addEventListener("disconnect", (event) => { if (event.device === device) listener(); }),
  };
}

/** Abre o seletor de dispositivo USB do navegador (a primeira vez) e conecta na impressora escolhida. */
export async function connectUsbPrinter(): Promise<PrinterConnection> {
  if (!navigator.usb) {
    throw new Error("Esse navegador não tem suporte a USB direto. Use o Chrome (no computador, ou no Android com cabo OTG). Não funciona no iPhone/Safari.");
  }
  const device = await navigator.usb.requestDevice({ filters: USB_FILTERS });
  return openUsbPrinter(device);
}

let reconnecting: Promise<PrinterConnection | null> | null = null;
/** Reconecta sozinho numa impressora USB que o dono já liberou antes (sem abrir o seletor). Devolve null se não houver. Chamadas ao mesmo tempo dividem a mesma tentativa. */
export function reconnectUsbPrinter(): Promise<PrinterConnection | null> {
  if (!navigator.usb) return Promise.resolve(null);
  reconnecting ??= (async () => {
    for (const device of (await navigator.usb?.getDevices()) ?? []) {
      try {
        return await openUsbPrinter(device);
      } catch {
        // Está em uso em outra aba, ou o driver ainda não foi trocado — tenta o próximo.
      }
    }
    return null;
  })().finally(() => { reconnecting = null; });
  return reconnecting;
}

/** Avisa quando um aparelho USB já liberado volta (impressora desligada e ligada de novo, cabo recolocado, PC acordou). Devolve a função que para de avisar. */
export function watchUsbPrinterAvailable(listener: () => void): () => void {
  const handler = () => listener();
  navigator.usb?.addEventListener("connect", handler);
  return () => navigator.usb?.removeEventListener("connect", handler);
}

// ---------------------------------------------------------------------------------------------------------------------
// Comandos ESC/POS e recibo
// ---------------------------------------------------------------------------------------------------------------------
const ESC = 0x1b;
const GS = 0x1d;
const CMD_INIT = [ESC, 0x40];
const CMD_ALIGN = { left: [ESC, 0x61, 0x00], center: [ESC, 0x61, 0x01], right: [ESC, 0x61, 0x02] };
const CMD_BOLD_ON = [ESC, 0x45, 0x01];
const CMD_BOLD_OFF = [ESC, 0x45, 0x00];
const CMD_REVERSE_ON = [GS, 0x42, 0x01]; // letra branca em fundo preto (como os itens do modelo da loja)
const CMD_REVERSE_OFF = [GS, 0x42, 0x00];
const CMD_CUT = [GS, 0x56, 0x00];
/** Tamanho da letra: largura e altura de 1 (normal) a 8 vezes. */
const cmdSize = (w: number, h: number) => [GS, 0x21, ((Math.min(8, Math.max(1, w)) - 1) << 4) | (Math.min(8, Math.max(1, h)) - 1)];

/** Em papel mais largo que o recibo (80mm), centraliza a área impressa: margem esquerda (GS L) e largura da área (GS W). */
export function centerAreaCommands(paperDots: number | undefined, columns = LINE_WIDTH): number[] {
  const receiptDots = columns * DOTS_PER_COLUMN;
  if (!paperDots || paperDots <= receiptDots) return [];
  const margin = Math.floor((paperDots - receiptDots) / 2);
  return [GS, 0x4c, margin & 0xff, margin >> 8, GS, 0x57, receiptDots & 0xff, receiptDots >> 8];
}

/** Tira acento (impressora térmica barata não entende UTF-8/acentuação). */
const textBytes = (text: string): number[] => Array.from(toPrinterText(text)).map((char) => char.charCodeAt(0) & 0xff);

/** Monta o recibo do pedido em bytes ESC/POS, prontos pra mandar pra impressora (o desenho está em receiptLayout.ts). */
export type ReceiptBytesOptions = { paperDots?: number; extraFeedLines?: number; columns?: number; reverseBold?: boolean; itemStyle?: "band" | "bigband" | "tall"; obsTall?: boolean; footer?: Uint8Array };
export function buildReceiptBytes(order: OrderRecord, options: ReceiptBytesOptions = {}): Uint8Array {
  const columns = options.columns ?? LINE_WIDTH;
  const bytes: number[] = [...CMD_INIT, ...centerAreaCommands(options.paperDots, columns)];
  buildReceiptLines(order, { width: columns, reverseBold: options.reverseBold ?? true, itemStyle: options.itemStyle ?? "band", obsTall: options.obsTall ?? false }).forEach((line) => {
    bytes.push(...CMD_ALIGN[line.align], ...cmdSize(line.w, line.h));
    line.parts.forEach((part) => {
      // Liga/desliga negrito e fundo preto no começo de cada trecho (impressora clone mais simples não pega no meio da linha).
      bytes.push(...(part.bold ? CMD_BOLD_ON : CMD_BOLD_OFF), ...(part.reverse ? CMD_REVERSE_ON : CMD_REVERSE_OFF), ...textBytes(part.text));
    });
    bytes.push(...CMD_REVERSE_OFF, ...CMD_BOLD_OFF, 0x0a, ...cmdSize(1, 1));
  });
  if (options.footer) {
    // rodapé com imagem (personagem + obrigado): um espaço e a imagem, antes do avanço do papel e do corte
    bytes.push(...CMD_ALIGN.left, 0x0a);
    for (let i = 0; i < options.footer.length; i++) bytes.push(options.footer[i]);
  }
  bytes.push(...CMD_ALIGN.left, 0x0a, 0x0a, 0x0a);
  for (let i = 0; i < (options.extraFeedLines ?? 0); i++) bytes.push(0x0a);
  bytes.push(...CMD_CUT);
  return new Uint8Array(bytes);
}

/** Imprime um pedido — monta o recibo (centralizado, se for o papel de 80mm do USB) e já manda pra impressora conectada. */
export async function printOrder(connection: PrinterConnection, order: OrderRecord): Promise<void> {
  if (connection.kind !== "usb") {
    await connection.output.write(buildReceiptBytes(order));
    return;
  }
  const footer = await loadReceiptFooter(); // se a imagem não carregar, o pedido imprime igual, sem o personagem
  await connection.output.write(buildReceiptBytes(order, { paperDots: USB_PAPER_DOTS, columns: USB_COLUMNS, extraFeedLines: USB_EXTRA_FEED_LINES, itemStyle: "bigband", obsTall: true, footer: footer ?? undefined }));
}

// ---------------------------------------------------------------------------------------------------------------------
// Rodapé com imagem (personagem + "ありがとうございます") — só no USB de 80mm
// ---------------------------------------------------------------------------------------------------------------------
/** PNG preto e branco, 576 pontos de largura (o papel todo), em public/recibo/. */
export const RECEIPT_FOOTER_URL = "recibo/rodape.png";

/** Converte pixels RGBA em imagem raster ESC/POS (GS v 0): 1 bit por ponto (1 = preto), 8 pontos por byte, largura completada com branco. */
export function rasterFromRgba(rgba: ArrayLike<number>, width: number, height: number): Uint8Array {
  const bytesPerRow = Math.ceil(width / 8);
  const out = new Uint8Array(8 + bytesPerRow * height);
  out.set([GS, 0x76, 0x30, 0x00, bytesPerRow & 0xff, bytesPerRow >> 8, height & 0xff, height >> 8]);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const dark = rgba[i + 3] > 127 && rgba[i] * 0.299 + rgba[i + 1] * 0.587 + rgba[i + 2] * 0.114 < 128;
      if (dark) out[8 + y * bytesPerRow + (x >> 3)] |= 0x80 >> (x & 7);
    }
  }
  return out;
}

let footerPromise: Promise<Uint8Array | null> | null = null;
/** Baixa o rodapé uma vez e deixa em memória. Qualquer falha devolve null (e tenta de novo no próximo pedido): imprimir o pedido nunca depende da imagem. */
export function loadReceiptFooter(): Promise<Uint8Array | null> {
  footerPromise ??= (async () => {
    try {
      if (typeof fetch !== "function" || typeof createImageBitmap !== "function" || typeof document === "undefined") return null;
      const response = await fetch(RECEIPT_FOOTER_URL, typeof AbortSignal !== "undefined" && "timeout" in AbortSignal ? { signal: AbortSignal.timeout(4000) } : undefined);
      if (!response.ok) return null;
      const bitmap = await createImageBitmap(await response.blob());
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const context = canvas.getContext("2d");
      if (!context) return null;
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, bitmap.width, bitmap.height);
      context.drawImage(bitmap, 0, 0);
      return rasterFromRgba(context.getImageData(0, 0, bitmap.width, bitmap.height).data, bitmap.width, bitmap.height);
    } catch {
      return null;
    }
  })().then((footer) => {
    if (!footer) footerPromise = null;
    return footer;
  });
  return footerPromise;
}

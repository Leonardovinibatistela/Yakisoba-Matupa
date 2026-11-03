import type { OrderRecord } from "./adminData";
import { buildReceiptLines, toPrinterText } from "./receiptLayout";

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
const CMD_ALIGN = { left: [ESC, 0x61, 0x00], center: [ESC, 0x61, 0x01], right: [ESC, 0x61, 0x02] };
const CMD_BOLD_ON = [ESC, 0x45, 0x01];
const CMD_BOLD_OFF = [ESC, 0x45, 0x00];
const CMD_REVERSE_ON = [GS, 0x42, 0x01]; // letra branca em fundo preto (como os itens do modelo da loja)
const CMD_REVERSE_OFF = [GS, 0x42, 0x00];
const CMD_CUT = [GS, 0x56, 0x00];
/** Tamanho da letra: largura e altura de 1 (normal) a 8 vezes. */
const cmdSize = (w: number, h: number) => [GS, 0x21, ((Math.min(8, Math.max(1, w)) - 1) << 4) | (Math.min(8, Math.max(1, h)) - 1)];

/** Tira acento (impressora térmica barata não entende UTF-8/acentuação). */
const textBytes = (text: string): number[] => Array.from(toPrinterText(text)).map((char) => char.charCodeAt(0) & 0xff);

/** Monta o recibo do pedido em bytes ESC/POS, prontos pra mandar pra impressora (o desenho está em receiptLayout.ts). */
export function buildReceiptBytes(order: OrderRecord): Uint8Array {
  const bytes: number[] = [...CMD_INIT];
  buildReceiptLines(order).forEach((line) => {
    bytes.push(...CMD_ALIGN[line.align], ...cmdSize(line.w, line.h));
    line.parts.forEach((part) => {
      // Liga/desliga negrito e fundo preto no começo de cada trecho (impressora clone mais simples não pega no meio da linha).
      bytes.push(...(part.bold ? CMD_BOLD_ON : CMD_BOLD_OFF), ...(part.reverse ? CMD_REVERSE_ON : CMD_REVERSE_OFF), ...textBytes(part.text));
    });
    bytes.push(...CMD_REVERSE_OFF, ...CMD_BOLD_OFF, 0x0a, ...cmdSize(1, 1));
  });
  bytes.push(...CMD_ALIGN.left, 0x0a, 0x0a, 0x0a);
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

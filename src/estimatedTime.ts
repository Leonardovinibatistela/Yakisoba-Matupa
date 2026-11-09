// Tempo estimado do pedido (só regra, sem tela nem Firebase — dá pra testar sozinho). É o MESMO número em três lugares:
// o "PREVISTO PARA" do recibo, o "Previsto" da Cozinha e o aviso pro cliente no site (na hora de finalizar e dentro da
// mensagem do pedido). Mudou o tempo? É só trocar aqui.
export const ESTIMATED_MINUTES = { entrega: 45, retirada: 45 } as const;

/** Horário de Matupá (UTC-4, sem horário de verão) em "HH:MM", não importa o fuso do aparelho de quem pede. */
const STORE_OFFSET_MS = 4 * 3600000;
export function matupaClock(ms: number): string {
  const shifted = new Date(ms - STORE_OFFSET_MS);
  return `${String(shifted.getUTCHours()).padStart(2, "0")}:${String(shifted.getUTCMinutes()).padStart(2, "0")}`;
}

/** Horário em que um pedido feito agora fica pronto/chega ("20:15"), no relógio de Matupá. */
export function estimatedReadyClock(deliveryType: "entrega" | "retirada", nowMs: number): string {
  return matupaClock(nowMs + ESTIMATED_MINUTES[deliveryType] * 60000);
}

/** Linha do pedido que o cliente manda no WhatsApp: "⏱️ Tempo estimado: 45 min (previsto por volta das 20:15)". */
export function estimatedTimeLine(deliveryType: "entrega" | "retirada", nowMs: number): string {
  return `⏱️ Tempo estimado: ${ESTIMATED_MINUTES[deliveryType]} min (previsto por volta das ${estimatedReadyClock(deliveryType, nowMs)})`;
}

/** Frase do aviso na tela depois que o pedido é confirmado: "⏱️ Previsão: 45 min (por volta das 20:15)". */
export function estimatedTimeNotice(deliveryType: "entrega" | "retirada", nowMs: number): string {
  return `⏱️ Previsão: ${ESTIMATED_MINUTES[deliveryType]} min (por volta das ${estimatedReadyClock(deliveryType, nowMs)})`;
}

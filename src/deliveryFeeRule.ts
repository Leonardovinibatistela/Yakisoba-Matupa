// Só regra — nada de Firebase aqui, pra dar pra testar sozinho.

/** Taxa de entrega por distância. O admin edita isso no painel (guardado em menuStatus/deliveryFee). */
export type DeliveryFeeConfig = {
  /** Ligado: cobra pela distância (o cliente precisa calcular pela localização). Desligado: taxa fixa (baseFee). */
  enabled: boolean;
  /** Até quantos km vale só o valor base. */
  baseKm: number;
  baseFee: number;
  /** Passou do baseKm: a cada `stepKm` a mais (começado) soma `stepFee`. */
  stepKm: number;
  stepFee: number;
  /** Até onde a loja entrega. null = sem limite. */
  maxKm: number | null;
};

/** Taxa de antes de existir esse recurso — vale enquanto o admin não configurar nada. */
export const LEGACY_FLAT_FEE = 7;
/** Mesmo teto que as regras do Firestore aceitam num pedido (firestore.rules). */
export const MAX_DELIVERY_FEE = 100;

/** Onde fica a loja (Rua 4, nº 916 A, Cidade Alta, Matupá/MT). */
export const STORE_COORDS = { lat: -10.168631, lng: -54.91407 };
/** A distância do GPS é em linha reta; a estrada é sempre mais longa. Esse fator compensa. */
export const ROAD_FACTOR = 1.3;

export type Coords = { lat: number; lng: number };

const round2 = (value: number) => Math.round(value * 100) / 100;
const toRad = (degrees: number) => (degrees * Math.PI) / 180;

/** Distância em linha reta entre dois pontos (fórmula de haversine), em km. */
export function haversineKm(a: Coords, b: Coords): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Distância estimada por estrada da loja até o cliente (linha reta × fator), com 1 casa decimal. null se a posição for inválida. */
export function estimateRoadKm(from: Coords): number | null {
  if (!Number.isFinite(from.lat) || !Number.isFinite(from.lng) || Math.abs(from.lat) > 90 || Math.abs(from.lng) > 180) return null;
  return Math.round(haversineKm(STORE_COORDS, from) * ROAD_FACTOR * 10) / 10;
}

/** Até baseKm: só baseFee. Passou: a cada stepKm a mais (começado) soma stepFee. Nunca passa do teto das regras. */
export function computeDeliveryFee(km: number, config: DeliveryFeeConfig): number {
  if (!(km > config.baseKm) || !(config.stepKm > 0)) return round2(Math.min(config.baseFee, MAX_DELIVERY_FEE));
  const steps = Math.ceil((km - config.baseKm) / config.stepKm - 1e-9);
  return round2(Math.min(config.baseFee + steps * config.stepFee, MAX_DELIVERY_FEE));
}

/** true se a loja não entrega tão longe. */
export function isBeyondMaxKm(km: number, config: DeliveryFeeConfig): boolean {
  return config.maxKm !== null && km > config.maxKm;
}

/** Taxa fixa (sem distância): o valor base configurado, ou os R$ 7 de sempre se ainda não configurou. */
export function flatDeliveryFee(config: DeliveryFeeConfig | null): number {
  return config ? config.baseFee : LEGACY_FLAT_FEE;
}

const isNum = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

/** Lê o que veio do Firestore. Qualquer coisa fora do normal vira null (= volta pra taxa fixa de R$ 7). */
export function normalizeDeliveryFeeConfig(data: unknown): DeliveryFeeConfig | null {
  if (typeof data !== "object" || data === null) return null;
  const d = data as Record<string, unknown>;
  if (typeof d.enabled !== "boolean" || !isNum(d.baseKm) || !isNum(d.baseFee) || !isNum(d.stepKm) || !isNum(d.stepFee)) return null;
  const maxKm = d.maxKm === null || d.maxKm === undefined ? null : d.maxKm;
  if (maxKm !== null && !isNum(maxKm)) return null;
  if (d.baseKm < 0 || d.baseKm > 200 || d.baseFee < 0 || d.baseFee > MAX_DELIVERY_FEE || !(d.stepKm > 0) || d.stepKm > 200 || d.stepFee < 0 || d.stepFee > MAX_DELIVERY_FEE) return null;
  if (maxKm !== null && maxKm <= 0) return null;
  return { enabled: d.enabled, baseKm: d.baseKm, baseFee: d.baseFee, stepKm: d.stepKm, stepFee: d.stepFee, maxKm };
}

const money = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const kmText = (value: number) => value.toLocaleString("pt-BR", { maximumFractionDigits: 1 });

/** Frase que explica a regra ("Até 7 km: R$ 7,00. A cada 1 km a mais: + R$ 1,00."). */
export function describeDeliveryRule(config: DeliveryFeeConfig): string {
  const base = `Até ${kmText(config.baseKm)} km: ${money(config.baseFee)}.`;
  const step = config.stepFee > 0 ? ` A cada ${config.stepKm === 1 ? "1 km" : `${kmText(config.stepKm)} km`} a mais: + ${money(config.stepFee)}.` : "";
  const max = config.maxKm !== null ? ` Entrega até ${kmText(config.maxKm)} km.` : "";
  return base + step + max;
}

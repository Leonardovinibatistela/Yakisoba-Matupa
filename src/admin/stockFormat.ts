import type { IngredientUnit } from "./ingredients";

export const UNIT_LABELS: Record<IngredientUnit, string> = { kg: "kg", g: "g", l: "litros", ml: "ml", un: "unidades" };

export const parseNumber = (raw: string): number => Number(raw.trim().replace(",", "."));
export const formatNumber = (value: number): string => value.toLocaleString("pt-BR", { maximumFractionDigits: 3 });
/** Número como texto editável (vírgula decimal, no máximo 3 casas). */
export const toDraft = (value: number): string => String(Math.round(value * 1000) / 1000).replace(".", ",");
export const formatMoney = (value: number): string => `R$ ${value.toFixed(2).replace(".", ",")}`;
// Custo por grama/ml é centavos (ex.: R$ 0,0325) — com 2 casas arredondaria pra R$ 0,03 e esconderia a diferença.
export const formatUnitCost = (value: number): string => `R$ ${value.toFixed(value >= 1 ? 2 : value >= 0.1 ? 3 : 4).replace(".", ",")}`;
export const normalize = (value: string): string => value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
export const escapeHtml = (value: string): string => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Se o Firebase demorar demais (internet ruim), a tela avisa em vez de ficar esperando pra sempre.
export const withTimeout = <T,>(promise: Promise<T>, ms = 15000): Promise<T> => Promise.race([promise, new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), ms))]);
export const SAVE_FAILED = "Não salvou — confere a internet e tenta de novo.";

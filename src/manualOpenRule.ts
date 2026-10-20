// Só regra — nada de Firebase aqui, pra dar pra testar sozinho.
import { scheduleMinutes } from "./scheduleRule";

/** O que o botão "Abrir agora" do painel guarda: se está ligado e QUANDO foi ligado. */
export type ManualOpenInfo = { open: boolean; openedAt: Date | null };

export const sameLocalDay = (a: Date, b: Date): boolean => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

/** O "dia de funcionamento" da loja termina às 2h da manhã (sexta cheia e evento passam da meia-noite). */
export const BUSINESS_DAY_END_HOUR = 2;

/** Quando acaba o dia de funcionamento em que `from` caiu: a próxima 2h da manhã depois de `from`. */
export function businessDayEnd(from: Date): Date {
  const end = new Date(from.getFullYear(), from.getMonth(), from.getDate(), BUSINESS_DAY_END_HOUR, 0, 0, 0);
  if (end.getTime() <= from.getTime()) end.setDate(end.getDate() + 1);
  return end;
}

// Tolerância pro relógio do aparelho estar um pouco atrás do relógio do servidor (que grava a hora de ligar).
const CLOCK_SKEW_MS = 10 * 60 * 1000;

/** `now` ainda está no mesmo dia de funcionamento em que `from` foi ligado (vai até as 2h da manhã seguinte)? */
export function isSameBusinessDay(from: Date, now: Date): boolean {
  return now.getTime() >= from.getTime() - CLOCK_SKEW_MS && now.getTime() < businessDayEnd(from).getTime();
}

/**
 * Até quando vale um "Abrir agora" ligado em `openedAt` (desliga sozinho, mesmo que o admin esqueça):
 * - ligou DEPOIS do horário (à noite ou de madrugada): vai até as 2h da manhã seguinte (sexta cheia, evento);
 * - ligou ANTES do horário normal (de manhã/tarde, só pra abrir mais cedo): vai até o fechamento normal daquele
 *   dia (22h seg-sex, 23h sáb-dom) — não fica aberto a noite toda por esquecimento.
 */
export function manualOpenExpiry(openedAt: Date): Date {
  const minutes = openedAt.getHours() * 60 + openedAt.getMinutes();
  const { openMinutes, closeMinutes } = scheduleMinutes(openedAt);
  if (minutes >= BUSINESS_DAY_END_HOUR * 60 && minutes < openMinutes) {
    const end = new Date(openedAt.getFullYear(), openedAt.getMonth(), openedAt.getDate(), 0, 0, 0, 0);
    end.setMinutes(closeMinutes);
    return end;
  }
  return businessDayEnd(openedAt);
}

/** "Abrir agora" está valendo AGORA? Ligado, com data de quando foi ligado (registro antigo sem data não vale: lado seguro) e ainda dentro do prazo de manualOpenExpiry. */
export function isManualOpenActive(info: ManualOpenInfo, now: Date): boolean {
  if (!info.open || info.openedAt === null) return false;
  return now.getTime() >= info.openedAt.getTime() - CLOCK_SKEW_MS && now.getTime() < manualOpenExpiry(info.openedAt).getTime();
}

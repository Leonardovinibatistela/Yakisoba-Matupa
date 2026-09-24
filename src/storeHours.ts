// Só regra de horário — nada de tela nem de Firebase aqui. Usado pelo site (App.tsx) e pelo painel (AdminApp.tsx),
// pra os dois sempre concordarem sobre "está aberto?".
import { isManualOpenActive, type ManualOpenInfo } from "./manualOpenRule";

// Horário de funcionamento: seg-sex 18:30-22h, sáb-dom 18:30-23h.
export const STORE_HOURS_LABEL = "Seg a Sex 18:30–22h · Sáb e Dom 18:30–23h";

export function scheduleMinutes(date: Date) {
  const day = date.getDay(); // 0 = domingo ... 6 = sábado
  const isWeekend = day === 0 || day === 6;
  return { openMinutes: 18 * 60 + 30, closeMinutes: isWeekend ? 23 * 60 : 22 * 60 };
}

export function isStoreOpen(date = new Date()): boolean {
  const { openMinutes, closeMinutes } = scheduleMinutes(date);
  const minutesNow = date.getHours() * 60 + date.getMinutes();
  return minutesNow >= openMinutes && minutesNow < closeMinutes;
}

// Usado pela abertura antecipada (botão do admin): mesmo com o site aberto
// na marra fora do horário, nunca deixa passar do horário oficial de
// fechar — assim o Sooba não corre risco de ficar "aberto" a noite toda
// se o admin esquecer de desligar o botão.
export function isBeforeClosingTime(date = new Date()): boolean {
  const minutesNow = date.getHours() * 60 + date.getMinutes();
  return minutesNow < scheduleMinutes(date).closeMinutes;
}

/**
 * A abertura antecipada está valendo AGORA? Só se estiver ligada, tiver sido ligada HOJE (expira à meia-noite)
 * e ainda não tiver passado do horário oficial de fechar. Passou disso, é como se o botão tivesse desligado:
 * o site fecha e o botão do painel volta a "Abrir agora".
 */
export const isManualOpenEffective = (info: ManualOpenInfo, now: Date): boolean => isManualOpenActive(info, now) && isBeforeClosingTime(now);

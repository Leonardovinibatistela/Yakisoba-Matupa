// Só regra de horário — nada de tela nem de Firebase aqui. Usado pelo site (App.tsx) e pelo painel (AdminApp.tsx),
// pra os dois sempre concordarem sobre "está aberto?".
import { isManualOpenActive, type ManualOpenInfo } from "./manualOpenRule";
import { isManualCloseActive, type ManualCloseInfo } from "./manualCloseRule";

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

/**
 * O botão "Abrir agora" está valendo AGORA? Só se estiver ligado e dentro do dia de funcionamento em que foi ligado:
 * ele abre o site fora do horário (antes de abrir ou depois de fechar — ex.: sexta cheia, evento, quer seguir
 * recebendo pedido depois das 22h) e expira sozinho às 2h da manhã, então o site nunca fica aberto a noite toda
 * se esquecerem de desligar.
 * (Antes ele também morria no horário oficial de fechar, e por isso "não fazia nada" depois das 22h.)
 */
export const isManualOpenEffective = (info: ManualOpenInfo, now: Date): boolean => isManualOpenActive(info, now);

/**
 * Se está aberto AGORA, juntando tudo: o fechamento manual ("Fechar por hoje") sempre vence — ignora a
 * agenda normal e a abertura antecipada, porque foi um pedido explícito do admin pra não abrir hoje.
 * Sem ele, vale o de sempre: agenda normal OU "Abrir agora" ligado (até as 2h da manhã).
 */
export function computeStoreOpen(scheduleOpen: boolean, manualOpenInfo: ManualOpenInfo, manualCloseInfo: ManualCloseInfo, now: Date): boolean {
  if (isManualCloseActive(manualCloseInfo, now)) return false;
  return scheduleOpen || isManualOpenEffective(manualOpenInfo, now);
}

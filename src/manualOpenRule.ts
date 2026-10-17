// Só regra — nada de Firebase aqui, pra dar pra testar sozinho.

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
 * "Abrir agora" só vale no DIA DE FUNCIONAMENTO em que foi ligado: vai até as 2h da manhã e aí desliga sozinho,
 * mesmo que o admin esqueça — ligou às 21:55 ou depois da meia-noite, fecha às 2h. (Antes ela ficava ligada pra
 * sempre e, no dia seguinte, o site abria de novo desde 00:00.) Sem data de quando foi ligada (registro antigo),
 * não vale: é o lado seguro. Dentro desse prazo vale mesmo depois do horário oficial de fechar.
 */
export function isManualOpenActive(info: ManualOpenInfo, now: Date): boolean {
  return info.open && info.openedAt !== null && isSameBusinessDay(info.openedAt, now);
}

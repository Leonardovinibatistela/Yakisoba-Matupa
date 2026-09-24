// Só regra — nada de Firebase aqui, pra dar pra testar sozinho.

/** O que o botão "Abrir agora" do painel guarda: se está ligado e QUANDO foi ligado. */
export type ManualOpenInfo = { open: boolean; openedAt: Date | null };

export const sameLocalDay = (a: Date, b: Date): boolean => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

/**
 * A abertura antecipada só vale no DIA em que foi ligada. Passou da meia-noite, ela expira sozinha —
 * antes ela ficava ligada pra sempre e, no dia seguinte, o site abria de novo desde 00:00 até o horário
 * de fechar. Sem data de quando foi ligada (registro antigo), não vale: é o lado seguro.
 * O horário oficial de fechar continua mandando por cima disso (ver App.tsx).
 */
export function isManualOpenActive(info: ManualOpenInfo, now: Date): boolean {
  return info.open && info.openedAt !== null && sameLocalDay(info.openedAt, now);
}

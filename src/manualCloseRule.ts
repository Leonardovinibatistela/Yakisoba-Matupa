// Só regra — nada de Firebase aqui, pra dar pra testar sozinho.
import { isSameBusinessDay } from "./manualOpenRule";

/** O que o botão "Fechar por hoje" do painel guarda: se está ligado e QUANDO foi ligado. */
export type ManualCloseInfo = { closed: boolean; closedAt: Date | null };

/**
 * O fechamento manual ("loja de mudança", feriado, etc.) só vale no DIA DE FUNCIONAMENTO em que foi ligado —
 * às 2h da manhã seguinte ele expira sozinho (mesmo corte do "Abrir agora", pra um não soltar o outro à
 * meia-noite) e o site volta a seguir o horário normal, sem ninguém precisar lembrar
 * de desligar (mesma ideia da abertura antecipada, ver manualOpenRule.ts). Sem data de quando foi ligado
 * (registro antigo/incompleto), não vale: é o lado seguro — nunca deixa o site fechado à toa por engano.
 */
export function isManualCloseActive(info: ManualCloseInfo, now: Date): boolean {
  return info.closed && info.closedAt !== null && isSameBusinessDay(info.closedAt, now);
}

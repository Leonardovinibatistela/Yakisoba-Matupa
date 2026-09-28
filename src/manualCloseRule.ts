// Só regra — nada de Firebase aqui, pra dar pra testar sozinho.
import { sameLocalDay } from "./manualOpenRule";

/** O que o botão "Fechar por hoje" do painel guarda: se está ligado e QUANDO foi ligado. */
export type ManualCloseInfo = { closed: boolean; closedAt: Date | null };

/**
 * O fechamento manual ("loja de mudança", feriado, etc.) só vale no DIA em que foi ligado — passou da
 * meia-noite, ele expira sozinho e o site volta a seguir o horário normal, sem ninguém precisar lembrar
 * de desligar (mesma ideia da abertura antecipada, ver manualOpenRule.ts). Sem data de quando foi ligado
 * (registro antigo/incompleto), não vale: é o lado seguro — nunca deixa o site fechado à toa por engano.
 */
export function isManualCloseActive(info: ManualCloseInfo, now: Date): boolean {
  return info.closed && info.closedAt !== null && sameLocalDay(info.closedAt, now);
}

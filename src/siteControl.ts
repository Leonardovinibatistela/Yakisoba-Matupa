// Só regra — nada de tela nem de Firebase aqui, pra dar pra testar sozinho.
// O painel tem UM botão pro site: sempre faz o contrário do que está acontecendo agora (aberto -> fechar,
// fechado -> abrir). Por baixo ele mexe nas duas chaves de sempre (fechamento manual e abertura manual),
// mas nunca deixa as duas ligadas juntas, então não dá pra ficar "botão verde e site fechado".
import { computeStoreOpen, isManualOpenEffective, isStoreOpen, scheduleMinutes } from "./storeHours";
import { isManualCloseActive, type ManualCloseInfo } from "./manualCloseRule";
import { businessDayEnd, manualOpenExpiry, sameLocalDay, type ManualOpenInfo } from "./manualOpenRule";

/** O que gravar nas duas chaves quando o botão é apertado (as duas sempre, pra nunca sobrar uma ligada). */
export type SiteWrites = { manualClose: boolean; manualOpen: boolean };

/**
 * Site aberto agora -> fecha (liga o fechamento, desliga a abertura manual).
 * Site fechado agora -> abre: dentro do horário só tira o fechamento (volta ao horário normal);
 * fora do horário liga a abertura manual (vale até as 2h da manhã, ver manualOpenRule.ts).
 */
export function planSitePress(now: Date, manualOpenInfo: ManualOpenInfo, manualCloseInfo: ManualCloseInfo): SiteWrites {
  const scheduleOpen = isStoreOpen(now);
  const open = computeStoreOpen(scheduleOpen, manualOpenInfo, manualCloseInfo, now);
  if (open) return { manualClose: true, manualOpen: false };
  return { manualClose: false, manualOpen: !scheduleOpen };
}

export type SiteView = {
  open: boolean;
  headline: string;
  buttonLabel: string;
  /** Uma frase explicando POR QUE está assim e quando muda. */
  detail: string;
  /** Pergunta de confirmação (só quando o botão vai FECHAR o site); null quando vai abrir. */
  confirmText: string | null;
};

const hhmm = (date: Date) => date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
const sinceLabel = (date: Date | null, now: Date) => (date === null ? "" : sameLocalDay(date, now) ? ` (desde ${hhmm(date)})` : ` (desde ${date.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })})`);
const addDays = (date: Date, days: number) => { const copy = new Date(date); copy.setDate(copy.getDate() + days); return copy; };
const dayWord = (target: Date, now: Date) => (sameLocalDay(target, now) ? "hoje" : sameLocalDay(target, addDays(now, 1)) ? "amanhã" : target.toLocaleDateString("pt-BR", { weekday: "long" }));
/** "às 2h da manhã" / "às 22h" — quando um "Abrir" ligado em `openedAt` desliga sozinho. */
const expiryLabel = (openedAt: Date) => { const hour = manualOpenExpiry(openedAt).getHours(); return hour === 2 ? "às 2h da manhã" : `às ${hour}h`; };
const openLabel = (date: Date) => { const { openMinutes } = scheduleMinutes(date); return `${String(Math.floor(openMinutes / 60)).padStart(2, "0")}:${String(openMinutes % 60).padStart(2, "0")}`; };
/** Próxima abertura do horário normal depois de `after`. */
function nextScheduleOpen(after: Date): Date {
  const candidate = new Date(after.getFullYear(), after.getMonth(), after.getDate(), 0, 0, 0, 0);
  candidate.setMinutes(scheduleMinutes(candidate).openMinutes);
  if (candidate.getTime() <= after.getTime()) {
    const next = addDays(candidate, 1);
    next.setHours(0, scheduleMinutes(next).openMinutes, 0, 0);
    return next;
  }
  return candidate;
}

export function describeSite(now: Date, manualOpenInfo: ManualOpenInfo, manualCloseInfo: ManualCloseInfo): SiteView {
  const scheduleOpen = isStoreOpen(now);
  const manualClosed = isManualCloseActive(manualCloseInfo, now);
  const manualOpened = isManualOpenEffective(manualOpenInfo, now);
  const open = computeStoreOpen(scheduleOpen, manualOpenInfo, manualCloseInfo, now);
  if (open) {
    const detail = manualOpened
      ? `Aberto por você${sinceLabel(manualOpenInfo.openedAt, now)}. Fecha sozinho ${expiryLabel(manualOpenInfo.openedAt ?? now)}.`
      : `Horário normal. Fecha sozinho às ${Math.floor(scheduleMinutes(now).closeMinutes / 60)}h.`;
    return { open: true, headline: "🟢 SITE ABERTO", buttonLabel: "🔒 Fechar o site", detail, confirmText: "Fechar o site agora? Ninguém consegue pedir até as 2h da manhã; depois volta ao horário normal sozinho. Dá pra abrir de novo a qualquer hora." };
  }
  if (manualClosed) {
    const back = nextScheduleOpen(businessDayEnd(manualCloseInfo.closedAt ?? now));
    return { open: false, headline: "🔴 SITE FECHADO", buttonLabel: "🟢 Abrir o site", detail: `Fechado por você${sinceLabel(manualCloseInfo.closedAt, now)}. Volta ao horário normal ${dayWord(back, now)} às ${openLabel(back)}.`, confirmText: null };
  }
  const next = nextScheduleOpen(now);
  return { open: false, headline: "🔴 SITE FECHADO", buttonLabel: "🟢 Abrir o site", detail: `Fora do horário. Abre ${dayWord(next, now)} às ${openLabel(next)}. Se apertar "Abrir o site", abre agora e fecha sozinho ${expiryLabel(now)}.`, confirmText: null };
}

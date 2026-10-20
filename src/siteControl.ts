// Só regra — nada de tela nem de Firebase aqui, pra dar pra testar sozinho.
// O painel mostra o status do site (aberto/fechado, se está recebendo pedido) e dois tipos de botão:
//  - o BOTÃO PRINCIPAL faz o contrário do que está acontecendo agora, com o texto dizendo exatamente o que vai
//    acontecer ("Fechar o site agora" / "Abrir o site agora");
//  - o botão "Hoje não vamos abrir" (e o de cancelar) é pra quando o estabelecimento não vai abrir naquele dia:
//    o site fica fechado o dia todo e NÃO abre na hora de abrir.
// Por baixo tudo mexe nas duas chaves de sempre (fechamento manual e abertura manual), mas nunca deixa as duas
// ligadas juntas, então não dá pra ficar "botão verde e site fechado".
import { computeStoreOpen, isManualOpenEffective, isStoreOpen, scheduleMinutes } from "./storeHours";
import { isManualCloseActive, type ManualCloseInfo } from "./manualCloseRule";
import { BUSINESS_DAY_END_HOUR, businessDayEnd, manualOpenExpiry, sameLocalDay, type ManualOpenInfo } from "./manualOpenRule";

/** O que gravar nas duas chaves quando um botão é apertado (as duas sempre, pra nunca sobrar uma ligada). */
export type SiteWrites = { manualClose: boolean; manualOpen: boolean };

/**
 * Botão principal. Site aberto agora -> fecha (liga o fechamento, desliga a abertura manual).
 * Site fechado agora -> abre: dentro do horário só tira o fechamento (volta ao horário normal);
 * fora do horário liga a abertura manual (vale até as 2h da manhã, ver manualOpenRule.ts).
 */
export function planSitePress(now: Date, manualOpenInfo: ManualOpenInfo, manualCloseInfo: ManualCloseInfo): SiteWrites {
  const scheduleOpen = isStoreOpen(now);
  const open = computeStoreOpen(scheduleOpen, manualOpenInfo, manualCloseInfo, now);
  if (open) return { manualClose: true, manualOpen: false };
  return { manualClose: false, manualOpen: !scheduleOpen };
}

/** "Hoje não vamos abrir": o site fica fechado o dia todo (até as 2h da manhã seguinte) e não abre na hora de abrir. */
export function planSkipToday(): SiteWrites {
  return { manualClose: true, manualOpen: false };
}

/** Desfaz o "Hoje não vamos abrir": tira o fechamento e volta ao horário normal (sem forçar abrir agora). */
export function planCancelSkip(): SiteWrites {
  return { manualClose: false, manualOpen: false };
}

export type SiteAction = {
  label: string;
  /** Frase curta embaixo do botão dizendo EXATAMENTE o que acontece se apertar. */
  hint: string;
  /** Pergunta de confirmação (só nas ações que fecham o site); null nas demais. */
  confirmText: string | null;
};

export type SiteView = {
  open: boolean;
  headline: string;
  /** Uma frase explicando POR QUE está assim e quando muda. */
  detail: string;
  /** Botão principal (aberto -> fechar agora; fechado -> abrir agora). */
  primary: SiteAction;
  /** Segundo botão: "Hoje não vamos abrir" (skip) ou "Hoje vamos abrir" (cancelSkip); null quando não faz sentido. */
  secondary: (SiteAction & { kind: "skip" | "cancelSkip" }) | null;
};

const hhmm = (date: Date) => date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
const sinceLabel = (date: Date | null, now: Date) => (date === null ? "" : sameLocalDay(date, now) ? ` (desde ${hhmm(date)})` : ` (desde ${date.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })})`);
const addDays = (date: Date, days: number) => { const copy = new Date(date); copy.setDate(copy.getDate() + days); return copy; };
const dayWord = (target: Date, now: Date) => (sameLocalDay(target, now) ? "hoje" : sameLocalDay(target, addDays(now, 1)) ? "amanhã" : target.toLocaleDateString("pt-BR", { weekday: "long" }));
/** "às 2h da manhã" / "às 22h" — quando um "Abrir" ligado em `openedAt` desliga sozinho. */
const expiryLabel = (openedAt: Date) => { const hour = manualOpenExpiry(openedAt).getHours(); return hour === 2 ? "às 2h da manhã" : `às ${hour}h`; };
const clock = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
const openLabel = (date: Date) => clock(scheduleMinutes(date).openMinutes);
const minutesOf = (date: Date) => date.getHours() * 60 + date.getMinutes();
/** Entre 2h da manhã e a abertura do dia (ex.: de manhã/tarde): "hoje" ainda não abriu. */
const isBeforeOpeningToday = (date: Date) => minutesOf(date) >= BUSINESS_DAY_END_HOUR * 60 && minutesOf(date) < scheduleMinutes(date).openMinutes;
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
  const closeHour = Math.floor(scheduleMinutes(now).closeMinutes / 60);
  const tomorrowOpen = nextScheduleOpen(businessDayEnd(now));

  if (open) {
    const detail = manualOpened
      ? `Aberto por você${sinceLabel(manualOpenInfo.openedAt, now)}. Fecha sozinho ${expiryLabel(manualOpenInfo.openedAt ?? now)}.`
      : `Horário normal. Fecha sozinho às ${closeHour}h.`;
    return {
      open: true,
      headline: "🟢 SITE ABERTO · recebendo pedidos",
      detail,
      primary: {
        label: "🔒 Fechar o site agora",
        hint: `Se apertar, o site FECHA agora pra todos os clientes e só volta ${dayWord(tomorrowOpen, now)} às ${openLabel(tomorrowOpen)}.`,
        confirmText: "Fechar o site AGORA? Os clientes não conseguem mais pedir até o horário normal de amanhã. Dá pra abrir de novo a qualquer hora.",
      },
      secondary: null,
    };
  }

  const openNowHint = scheduleOpen
    ? `Reabre agora no horário normal (fecha às ${closeHour}h).`
    : `Abre agora e fecha sozinho ${expiryLabel(now)}.`;
  const primary: SiteAction = { label: "🟢 Abrir o site agora", hint: openNowHint, confirmText: null };

  if (manualClosed) {
    const closedAt = manualCloseInfo.closedAt ?? now;
    const back = nextScheduleOpen(businessDayEnd(closedAt));
    // Marcado ANTES da abertura do dia = "hoje não vamos abrir" (o estabelecimento não abre hoje); durante o atendimento = fechou por você.
    const skipMarked = isBeforeOpeningToday(closedAt);
    const headline = skipMarked ? "🔴 NÃO VAMOS ABRIR HOJE · não recebe pedidos" : "🔴 SITE FECHADO · não recebe pedidos";
    const detail = skipMarked
      ? `Você marcou${sinceLabel(closedAt, now)} que hoje não abre. O site fica fechado o dia todo e volta ${dayWord(back, now)} às ${openLabel(back)}.`
      : `Fechado por você${sinceLabel(closedAt, now)}. Volta ao horário normal ${dayWord(back, now)} às ${openLabel(back)}.`;
    // "Hoje vamos abrir" (cancelar): só enquanto ainda dá pra abrir hoje no horário normal.
    const cancel = skipMarked && (scheduleOpen || isBeforeOpeningToday(now));
    return {
      open: false,
      headline,
      detail,
      primary,
      secondary: cancel
        ? {
            kind: "cancelSkip",
            label: "↩️ Hoje vamos abrir",
            hint: scheduleOpen ? `Cancela o "não vamos abrir hoje" e o site abre agora, no horário normal.` : `Cancela o "não vamos abrir hoje" e o site abre no horário normal (hoje às ${openLabel(now)}).`,
            confirmText: null,
          }
        : null,
    };
  }

  const next = nextScheduleOpen(now);
  const canSkip = isBeforeOpeningToday(now);
  return {
    open: false,
    headline: "🔴 SITE FECHADO · não recebe pedidos",
    detail: `Fora do horário. Abre ${dayWord(next, now)} às ${openLabel(next)}.`,
    primary,
    secondary: canSkip
      ? {
          kind: "skip",
          label: "🚫 Hoje não vamos abrir",
          hint: `O site fica fechado o dia todo e NÃO abre às ${openLabel(next)}. Amanhã volta ao horário normal sozinho.`,
          confirmText: `Hoje não vamos abrir? O site fica fechado o dia todo, não abre às ${openLabel(next)}, e amanhã volta ao horário normal sozinho. Dá pra desfazer a qualquer hora.`,
        }
      : null,
  };
}

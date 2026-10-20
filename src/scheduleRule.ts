// Só o horário de funcionamento, sem nenhum import — pra storeHours.ts e manualOpenRule.ts usarem sem dar volta
// uma no outra. Seg-sex 18:30-22h, sáb-dom 18:30-23h.
export function scheduleMinutes(date: Date) {
  const day = date.getDay(); // 0 = domingo ... 6 = sábado
  const isWeekend = day === 0 || day === 6;
  return { openMinutes: 18 * 60 + 30, closeMinutes: isWeekend ? 23 * 60 : 22 * 60 };
}

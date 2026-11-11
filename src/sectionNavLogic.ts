// Regras da barra de seções do cardápio (só lógica — sem tela, pra dar pra testar sozinha).

/** Nome curto da aba: tira o que vem entre parênteses ("Yakisoba Médio (500g)" -> "Yakisoba Médio"). O título completo continua na seção. */
export function chipLabel(name: string): string {
  const short = name.replace(/\s*\([^)]*\)/g, "").replace(/\s+/g, " ").trim();
  return short || name.trim();
}

/**
 * Qual seção está "valendo" na rolagem: a última cujo topo já passou da linha (logo abaixo do cabeçalho + barra).
 * `tops` vem na mesma ordem de `ids`; `null` = seção que não está na tela (fica de fora). Antes de chegar na primeira, vale a primeira.
 */
export function pickActiveSection(ids: string[], tops: (number | null)[], line: number): string | null {
  let current: string | null = ids[0] ?? null;
  ids.forEach((id, index) => {
    const top = tops[index];
    if (top !== null && top !== undefined && top <= line) current = id;
  });
  return current;
}

/** Onde rolar a barra pra deixar a aba no meio (nunca negativo, nunca além do fim). */
export function centerScrollLeft(chipLeft: number, chipWidth: number, barWidth: number, scrollWidth: number): number {
  const target = chipLeft - (barWidth - chipWidth) / 2;
  return Math.max(0, Math.min(target, Math.max(0, scrollWidth - barWidth)));
}

/** Se ainda tem aba escondida pra esquerda / direita (com 4px de folga pra arredondamento). */
export function scrollEdges(scrollLeft: number, barWidth: number, scrollWidth: number): { canLeft: boolean; canRight: boolean } {
  return { canLeft: scrollLeft > 4, canRight: scrollLeft + barWidth < scrollWidth - 4 };
}

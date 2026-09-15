// Som de aviso (tipo sininho) tocado quando um pedido novo chega no painel
// admin — gerado na hora com Web Audio, sem precisar de nenhum arquivo de
// áudio. Alguns navegadores só deixam tocar som depois de algum clique na
// página (política de autoplay) — como o admin sempre clica em algo antes
// (entrar, trocar de aba etc.), na prática funciona normal.
let sharedAudioContext: AudioContext | null = null;

// volume vai de 0 (mudo) a 1 (máximo) — controlado pelo controle deslizante
// do painel admin.
export function playNewOrderChime(volume: number = 1): void {
  if (volume <= 0) return;
  try {
    if (!sharedAudioContext) sharedAudioContext = new AudioContext();
    const ctx = sharedAudioContext;
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    const now = ctx.currentTime;
    const peakGain = 0.25 * Math.min(1, Math.max(0, volume));
    // Duas notas curtas (tipo "ding-dong" de campainha), pra chamar atenção
    // sem ser irritante nem parecer alarme de emergência.
    [{ freq: 987.77, start: 0, duration: 0.28 }, { freq: 1318.51, start: 0.16, duration: 0.32 }].forEach(({ freq, start, duration }) => {
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = freq;
      gain.gain.setValueAtTime(0, now + start);
      gain.gain.linearRampToValueAtTime(peakGain, now + start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + start + duration);
      oscillator.connect(gain);
      gain.connect(ctx.destination);
      oscillator.start(now + start);
      oscillator.stop(now + start + duration + 0.05);
    });
  } catch {
    // Navegador sem suporte a Web Audio, ou bloqueou o som — não trava nada,
    // só não toca (a impressão/pedido continuam funcionando normal).
  }
}

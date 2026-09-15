// Som de aviso (tipo sino de loja) tocado quando um pedido novo chega no
// painel admin — gerado na hora com Web Audio, sem precisar de nenhum
// arquivo de áudio. Alguns navegadores só deixam tocar som depois de algum
// clique na página (política de autoplay) — como o admin sempre clica em
// algo antes (entrar, trocar de aba etc.), na prática funciona normal.
let sharedAudioContext: AudioContext | null = null;

// Um sino de verdade não é uma nota "pura" — é a soma de várias frequências
// (parciais) tocando juntas, cada uma com um volume diferente. É essa mistura
// que faz o som ser bem mais forte e "metálico" do que um bipe comum.
const BELL_PARTIALS: { ratio: number; gain: number }[] = [
  { ratio: 1, gain: 1 },
  { ratio: 2, gain: 0.6 },
  { ratio: 2.4, gain: 0.4 },
  { ratio: 3, gain: 0.3 },
  { ratio: 4.2, gain: 0.22 },
];

function strikeBell(ctx: AudioContext, destination: AudioNode, startTime: number, freq: number, peakGain: number, duration: number): void {
  BELL_PARTIALS.forEach(({ ratio, gain }) => {
    const oscillator = ctx.createOscillator();
    const partialGain = ctx.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = freq * ratio;
    partialGain.gain.setValueAtTime(0, startTime);
    partialGain.gain.linearRampToValueAtTime(peakGain * gain, startTime + 0.006);
    partialGain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
    oscillator.connect(partialGain);
    partialGain.connect(destination);
    oscillator.start(startTime);
    oscillator.stop(startTime + duration + 0.05);
  });
}

// volume vai de 0 (mudo) a 1 (máximo) — controlado pelo controle deslizante
// do painel admin.
export function playNewOrderChime(volume: number = 1): void {
  if (volume <= 0) return;
  try {
    if (!sharedAudioContext) sharedAudioContext = new AudioContext();
    const ctx = sharedAudioContext;
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    const now = ctx.currentTime;
    // Compressor: "empurra" o volume geral pra cima sem estourar/distorcer
    // quando várias frequências tocam juntas — é o que deixa o sino soar
    // bem mais alto que o bipe antigo, mesmo no mesmo volume do aparelho.
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.setValueAtTime(-16, now);
    compressor.knee.setValueAtTime(14, now);
    compressor.ratio.setValueAtTime(8, now);
    compressor.attack.setValueAtTime(0.002, now);
    compressor.release.setValueAtTime(0.3, now);
    compressor.connect(ctx.destination);
    const peakGain = 1.3 * Math.min(1, Math.max(0, volume));
    // Duas batidas de sino (tipo campainha de balcão de loja).
    strikeBell(ctx, compressor, now, 1046.5, peakGain, 1.1); // C6
    strikeBell(ctx, compressor, now + 0.3, 1318.5, peakGain, 1.3); // E6
  } catch {
    // Navegador sem suporte a Web Audio, ou bloqueou o som — não trava nada,
    // só não toca (a impressão/pedido continuam funcionando normal).
  }
}

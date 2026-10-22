// Diagnóstico do painel: avisa quando ESTE computador/celular está com algo que faz o "Abrir/Fechar o site" não
// chegar nos clientes (relógio ou fuso errado, sem internet, servidor sem responder, ordem não confirmada).
// Só regra pura (testável). Quem fala com o Firebase é o connectionHealth.ts.
/** getTimezoneOffset() esperado em Matupá: UTC-4, sem horário de verão (America/Cuiaba). */
export const STORE_TZ_OFFSET_MINUTES = 240;

export type ConnectionState = { fromCache: boolean; hasPendingWrites: boolean; at: number };

const pad = (value: number) => String(value).padStart(2, "0");
/** Hora do relógio de um fuso (offset no formato do getTimezoneOffset: 240 = UTC-4). */
export function clockAt(ms: number, offsetMinutes: number, withSeconds = false): string {
  const shifted = new Date(ms - offsetMinutes * 60000);
  return `${pad(shifted.getUTCHours())}:${pad(shifted.getUTCMinutes())}${withSeconds ? ":" + pad(shifted.getUTCSeconds()) : ""}`;
}
/** "15:31" na hora de Matupá, qualquer que seja o fuso do aparelho. */
export const storeClock = (ms: number, withSeconds = false) => clockAt(ms, STORE_TZ_OFFSET_MINUTES, withSeconds);
/** "UTC-4" / "UTC-3" / "UTC+5:30" a partir do getTimezoneOffset. */
export function utcLabel(offsetMinutes: number): string {
  const sign = offsetMinutes > 0 ? "-" : "+";
  const abs = Math.abs(offsetMinutes);
  return `UTC${sign}${Math.floor(abs / 60)}${abs % 60 ? ":" + pad(abs % 60) : ""}`;
}

/** Problemas de relógio/fuso do aparelho (lista vazia = tudo certo). serverMs = hora certa vinda da internet (ou null se ainda não sabemos). */
export function clockIssues(nowMs: number, deviceOffsetMinutes: number, serverMs: number | null): string[] {
  const issues: string[] = [];
  if (deviceOffsetMinutes !== STORE_TZ_OFFSET_MINUTES) {
    issues.push(
      `O fuso horário deste computador é ${utcLabel(deviceOffsetMinutes)}, mas Matupá é UTC-4. Aqui agora aparecem ${clockAt(nowMs, deviceOffsetMinutes)} e em Matupá são ${storeClock(nowMs)}. ` +
        `O painel pode mostrar o site aberto ou fechado errado (principalmente perto das 18:30 e das 22h) e o "Abrir mais cedo" pode não funcionar. ` +
        `Corrija no Windows: Configurações → Hora e idioma → Data e hora → Fuso horário → (UTC-04:00) Cuiabá.`,
    );
  }
  if (serverMs !== null && Math.abs(nowMs - serverMs) > 3 * 60000) {
    const minutes = Math.round(Math.abs(nowMs - serverMs) / 60000);
    issues.push(
      `O relógio deste computador está ${minutes} min ${nowMs > serverMs ? "adiantado" : "atrasado"}. A hora certa em Matupá agora é ${storeClock(serverMs)}. ` +
        `Corrija em Configurações → Hora e idioma → Data e hora → ligue "Definir hora automaticamente".`,
    );
  }
  return issues;
}

export type ActionLog = { label: string; at: number; state: "pending" | "slow" | "ok" | "error"; detail?: string };
export type Notice = { tone: "ok" | "info" | "warn" | "error"; text: string };

/** Frase sobre a ÚLTIMA ordem dada ao site (Abrir/Fechar/Hoje não vamos abrir): mostra se o servidor confirmou de verdade. */
export function actionNotice(log: ActionLog | null, nowMs: number): Notice | null {
  if (!log) return null;
  const when = storeClock(log.at);
  switch (log.state) {
    case "pending":
      return { tone: "info", text: `⏳ Enviando pro servidor… (${log.label})` };
    case "slow":
      return { tone: "warn", text: `⚠️ O servidor ainda NÃO confirmou "${log.label}" (apertado às ${when}). O site pode não ter mudado pros clientes. Confira a internet deste computador; se não resolver, aperte Ctrl + F5.` };
    case "error":
      return { tone: "error", text: `❌ Não deu certo: "${log.label}" (${when}) — ${log.detail ?? "erro desconhecido"}. O site NÃO mudou. Tente de novo; se repetir, avise quem cuida do sistema.` };
    case "ok":
      return nowMs - log.at < 90000 ? { tone: "ok", text: `✓ Confirmado pelo servidor às ${when}: ${log.label}.` } : null;
  }
}

/** Aviso de conexão. lastOkAt = última vez que o servidor respondeu de verdade (ou null se nunca). */
export function connectionNotice(input: { online: boolean; conn: ConnectionState | null; lastOkAt: number | null }, nowMs: number): Notice | null {
  if (!input.online) return { tone: "error", text: "Este computador está SEM INTERNET. O que você apertar aqui não chega aos clientes." };
  if (input.conn?.fromCache) {
    const since = Math.max(0, nowMs - (input.lastOkAt ?? input.conn.at));
    if (since > 20000) return { tone: "warn", text: `O painel não está conseguindo falar com o servidor há ${Math.round(since / 1000)} s. O que você apertar aqui pode NÃO chegar aos clientes. Confira a internet; se não resolver, aperte Ctrl + F5.` };
  }
  return null;
}

/** "Chrome 155 · Windows 10/11" a partir do user agent. */
export function describeBrowser(ua: string): string {
  const browser = /Edg\/([\d.]+)/.exec(ua) ? `Edge ${/Edg\/(\d+)/.exec(ua)![1]}` : /OPR\/(\d+)/.exec(ua) ? `Opera ${/OPR\/(\d+)/.exec(ua)![1]}` : /Firefox\/(\d+)/.exec(ua) ? `Firefox ${/Firefox\/(\d+)/.exec(ua)![1]}` : /Chrome\/(\d+)/.exec(ua) ? `Chrome ${/Chrome\/(\d+)/.exec(ua)![1]}` : /Version\/(\d+).*Safari/.exec(ua) ? `Safari ${/Version\/(\d+)/.exec(ua)![1]}` : "navegador desconhecido";
  const os = /Windows NT 10\.0/.test(ua) ? "Windows 10/11" : /Windows NT 6\.3/.test(ua) ? "Windows 8.1" : /Windows NT 6\.2/.test(ua) ? "Windows 8" : /Windows NT 6\.1/.test(ua) ? "Windows 7" : /Windows/.test(ua) ? "Windows" : /Android ([\d.]+)/.exec(ua) ? `Android ${/Android ([\d.]+)/.exec(ua)![1]}` : /iPhone|iPad/.test(ua) ? "iOS" : /Mac OS X/.test(ua) ? "Mac" : /Linux/.test(ua) ? "Linux" : "sistema desconhecido";
  return `${browser} · ${os}`;
}

export type DiagnosticInput = {
  buildId: string | null;
  latestBuildId: string | null;
  nowMs: number;
  deviceOffsetMinutes: number;
  timeZone: string;
  serverMs: number | null;
  online: boolean;
  conn: ConnectionState | null;
  lastOkAt: number | null;
  email: string;
  userAgent: string;
  siteState: string;
  flags: string;
  action: ActionLog | null;
};

/** Texto pra copiar e mandar: tudo que explica por que o painel de UM aparelho pode estar diferente do de outro. */
export function buildDiagnosticText(input: DiagnosticInput): string {
  const skew = input.serverMs === null ? "ainda não medida" : `${Math.round((input.nowMs - input.serverMs) / 1000)} s de diferença`;
  const conn = !input.online ? "SEM INTERNET" : input.conn === null ? "ainda conectando" : input.conn.fromCache ? "SEM RESPOSTA do servidor (só memória do navegador)" : `conectado${input.lastOkAt ? ` (última resposta há ${Math.round((input.nowMs - input.lastOkAt) / 1000)} s)` : ""}`;
  const version = input.buildId === null ? "modo desenvolvimento" : input.latestBuildId === null ? `${input.buildId} (ainda não conferida)` : input.latestBuildId === input.buildId ? `${input.buildId} ✓ é a mais nova` : `${input.buildId} ⚠️ DESATUALIZADA (a mais nova é ${input.latestBuildId}) — aperte Ctrl + F5`;
  const action = input.action ? `${input.action.label} às ${storeClock(input.action.at)} — ${input.action.state === "ok" ? "confirmada pelo servidor" : input.action.state === "error" ? `ERRO: ${input.action.detail ?? "?"}` : input.action.state === "slow" ? "SEM confirmação do servidor" : "enviando"}` : "nenhuma desde que a página abriu";
  return [
    "Diagnóstico do painel Sooba",
    `Versão do painel: ${version}`,
    `Hora deste computador: ${clockAt(input.nowMs, input.deviceOffsetMinutes, true)} (${utcLabel(input.deviceOffsetMinutes)}, ${input.timeZone}) ${input.deviceOffsetMinutes === STORE_TZ_OFFSET_MINUTES ? "✓ mesmo fuso de Matupá" : "⚠️ FUSO DIFERENTE DE MATUPÁ (UTC-4)"}`,
    `Hora certa em Matupá agora: ${storeClock(input.serverMs ?? input.nowMs, true)} (relógio do computador: ${skew})`,
    `Internet do navegador: ${input.online ? "online" : "OFFLINE"}`,
    `Servidor (Firebase): ${conn}`,
    `Login: ${input.email}`,
    `Navegador: ${describeBrowser(input.userAgent)}`,
    `Estado do site agora: ${input.siteState}`,
    `Chaves guardadas: ${input.flags}`,
    `Última ordem dada neste aparelho: ${action}`,
  ].join("\n");
}

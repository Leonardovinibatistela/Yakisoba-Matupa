// Trava da tela da cozinha: com ela ligada o painel mostra SÓ a cozinha (sem faturamento, financeiro, estoque etc.) e só
// volta ao painel completo com a senha de 4 dígitos. A senha fica guardada (embaralhada, nunca em texto) neste navegador.
// É uma trava de TELA: segura quem não é técnico; não substitui um login separado.
const PIN_KEY = "sooba_kitchen_pin";
const LOCK_KEY = "sooba_kitchen_locked";

export const isValidPin = (pin: string) => /^\d{4}$/.test(pin);

/** SHA-256 de "sooba|PIN" em hexadecimal (a senha em si nunca é guardada). */
export async function hashPin(pin: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`sooba|${pin}`));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

const read = (key: string): string | null => { try { return localStorage.getItem(key); } catch { return null; } };
const write = (key: string, value: string | null): boolean => {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
    return read(key) === value;
  } catch {
    return false;
  }
};

export const hasKitchenPin = () => read(PIN_KEY) !== null;
export const isKitchenLocked = () => read(LOCK_KEY) === "1" && hasKitchenPin();

/**
 * Liga a trava. Na primeira vez cria a senha (precisa de `newPin`); nas próximas já existe e não precisa de nada.
 * Devolve uma mensagem de erro em português, ou null quando travou.
 */
export async function lockKitchen(newPin?: string): Promise<string | null> {
  if (!hasKitchenPin()) {
    if (!newPin || !isValidPin(newPin)) return "A senha precisa ter 4 números.";
    if (!write(PIN_KEY, await hashPin(newPin))) return "Não consegui guardar a senha neste navegador (a navegação privada impede). Use uma janela normal.";
  }
  return write(LOCK_KEY, "1") ? null : "Não consegui travar neste navegador (a navegação privada impede). Use uma janela normal.";
}

/** Destrava se a senha estiver certa. */
export async function unlockKitchen(pin: string): Promise<boolean> {
  const saved = read(PIN_KEY);
  if (saved === null || !isValidPin(pin) || (await hashPin(pin)) !== saved) return false;
  write(LOCK_KEY, null);
  return true;
}

/** Apaga a senha e a trava deste navegador (usado no "Esqueci a senha", que também sai da conta). */
export function resetKitchenLock(): void {
  write(LOCK_KEY, null);
  write(PIN_KEY, null);
}

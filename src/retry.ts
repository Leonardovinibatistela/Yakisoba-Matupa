/**
 * Tenta uma tarefa de novo quando ela falha (queda rápida de internet, Firebase
 * instável), esperando um tempo maior entre uma tentativa e outra. A primeira
 * tentativa é imediata. Se todas falharem, devolve o erro da última.
 *
 * `delaysMs` é a espera ANTES de cada nova tentativa — [1500, 4000] = 3
 * tentativas no total (na hora, depois de 1,5s, depois de mais 4s).
 */
export async function retry<T>(
  task: (attempt: number) => Promise<T>,
  delaysMs: number[],
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= delaysMs.length; attempt += 1) {
    if (attempt > 0) await sleep(delaysMs[attempt - 1]);
    try {
      return await task(attempt);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

import 'server-only';

/**
 * Runs `run` with a timeout. On timeout it both rejects (so the caller sees a
 * timeout error) AND aborts the passed AbortSignal, so a request that honors
 * the signal (the Gemini SDK, fetch) is actually cancelled rather than left
 * running in the background — important for paid calls, where an abandoned
 * in-flight request could still complete and bill while the caller retries.
 * `run` receives the signal; a request that cannot honor it may ignore it.
 */
export async function withTimeout<T>(run: (signal: AbortSignal) => Promise<T>, ms: number, message = 'Request timed out'): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error(message));
    }, ms);
  });
  try {
    return await Promise.race([run(controller.signal), timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Only ever used for idempotent, non-billable calls (status polls) — never
 * wrap a paid submit() call, since retrying it could start a second
 * generation job if the first request actually reached the provider.
 */
export async function retryOnce<T>(fn: () => Promise<T>, delayMs = 400): Promise<T> {
  try {
    return await fn();
  } catch {
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    return fn();
  }
}

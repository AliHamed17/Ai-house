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
      // Order matters: reject with OUR error before calling abort(). An
      // abort-aware `run` (fetch, the Gemini SDK) can react to the signal by
      // rejecting its own promise synchronously from inside abort()'s
      // listener dispatch — with a generic AbortError, not this message. If
      // that happened first, it would settle (and win) the Promise.race
      // below, so callers checking error.message against this specific
      // string (isSubmitTimeout) would never recognize it as their own
      // timeout: an ambiguous, possibly-already-billed request would then
      // get misclassified as a definite, safe-to-retry failure. Settling
      // this promise first guarantees the race resolves with OUR error
      // regardless of how (or how fast) `run` reacts to the abort.
      reject(new Error(message));
      controller.abort();
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

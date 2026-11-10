import 'server-only';

// Thrown when `withTimeout`'s deadline wins the race, in place of a plain
// Error, so a caller like reserveIdempotentSubmission that already has to
// treat this as an ambiguous (possibly-already-billed) outcome ALSO has a
// handle on the raw underlying call — still running for a request that
// cannot truly be cancelled (Higgsfield's subscribe() takes no AbortSignal)
// or that only stops OUR wait, not the provider's own already-accepted
// operation (the Gemini SDK's abortSignal). Without this, that raw promise's
// eventual real outcome is orphaned: nothing is ever listening for it again,
// so a client that later Resumes reconciles only to this same stale
// rejection forever, even long after the provider actually finished (and
// possibly billed) the request — the entire point of Resume, for exactly
// this ambiguous case, silently defeated. instanceof Error still holds
// (this extends it), so every existing `error instanceof Error &&
// error.message === ...` check (isSubmitTimeout in both providers) keeps
// matching it unchanged.
export class OrphanedTimeoutError extends Error {
  constructor(
    message: string,
    public readonly orphaned: Promise<unknown>,
  ) {
    super(message);
    this.name = 'OrphanedTimeoutError';
  }
}

/**
 * Runs `run` with a timeout. On timeout it both rejects (so the caller sees a
 * timeout error) AND aborts the passed AbortSignal, so a request that honors
 * the signal (the Gemini SDK, fetch) is actually cancelled rather than left
 * running in the background — important for paid calls, where an abandoned
 * in-flight request could still complete and bill while the caller retries.
 * `run` receives the signal; a request that cannot honor it may ignore it.
 *
 * On timeout, OrphanedTimeoutError's `orphaned` is exactly `run`'s OWN
 * returned promise — not some later transformation of it. A caller that does
 * further processing on run's result after withTimeout resolves (e.g.
 * higgsfield.server.ts extracting a request id and re-encoding a job id) must
 * do that processing INSIDE `run` itself, or a late reconciliation against
 * `orphaned` observes the untransformed value instead of what the caller's
 * own success path would have returned (regression: see idempotency.server's
 * reconciliation handler, which trusts `orphaned` to already be the final
 * value it caches).
 */
export async function withTimeout<T>(run: (signal: AbortSignal) => Promise<T>, ms: number, message = 'Request timed out'): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  // Captured once, outside the timeout executor, so both the race below AND
  // a timed-out rejection's own OrphanedTimeoutError can reference the exact
  // same promise — not a second, independent call to `run`.
  const raw = run(controller.signal);
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
      reject(new OrphanedTimeoutError(message, raw));
      controller.abort();
    }, ms);
  });
  try {
    return await Promise.race([raw, timeout]);
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

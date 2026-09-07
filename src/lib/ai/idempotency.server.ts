import 'server-only';

/**
 * A submission's HTTP response can be lost after the server has already
 * started (and, for a live provider, billed) a real generation — a dropped
 * connection, a client-side timeout, or a proxy hiccup all look identical to
 * the client, which cannot tell "never reached the server" apart from
 * "reached the server, which paid for and completed it, but I never heard
 * back." A client-supplied idempotency key lets a retried request for the
 * exact same submission be reconciled with the one that's already running
 * or already ran, instead of starting a duplicate paid one.
 *
 * Like resultStore/rateLimit, this is per-instance, in-memory, and bounded —
 * adequate for reconciling a retry within the same short window a visitor
 * would plausibly retry in; it does not need to survive a cold start.
 */
interface IdempotencyEntry {
  promise: Promise<string>;
  createdAt: number;
}

const TTL_MS = 10 * 60_000;
const MAX_ENTRIES = 200;
const store = new Map<string, IdempotencyEntry>();

function prune(): void {
  const now = Date.now();
  for (const [key, value] of store) {
    if (now - value.createdAt > TTL_MS) store.delete(key);
  }
}

/**
 * Ensures at most one `run()` (the paid provider submission) is ever in
 * flight for a given idempotency key. The reservation is a synchronous
 * Map.set that happens BEFORE `run()` is awaited, so a second call for the
 * same key arriving while the first is still running — e.g. a client whose
 * connection dropped mid-submit retrying immediately, before the original
 * request has even settled — sees the reservation already in place and
 * joins that same in-flight promise instead of starting a second, separately
 * billed submission. (A check-then-submit-then-record version of this,
 * which only records a key AFTER its submit resolves, does not close this
 * window: both requests would see an empty store and each start their own.)
 *
 * A run that fails releases its reservation, so a genuinely later attempt
 * (not just a concurrent or immediate retry) can try again fresh — this
 * function only prevents a duplicate for a submission that is still
 * outstanding or already succeeded, not a fresh choice to retry after a
 * known failure. A run that succeeds stays cached for the rest of the TTL,
 * so any later retry — concurrent or not — reconciles to the same job.
 * With no key supplied (an older client), every call runs independently.
 */
export function reserveIdempotentSubmission(key: string | undefined, run: () => Promise<string>): Promise<string> {
  if (!key) return run();
  prune();

  const existing = store.get(key);
  if (existing) return existing.promise;

  while (store.size >= MAX_ENTRIES) {
    const oldest = store.keys().next().value;
    if (oldest === undefined) break;
    store.delete(oldest);
  }

  const promise = run();
  promise.catch(() => {
    store.delete(key);
  });
  store.set(key, { promise, createdAt: Date.now() });
  return promise;
}

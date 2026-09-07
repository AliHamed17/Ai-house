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
  ttlMs: number;
  fingerprint: string;
}

// idempotencyKey is entirely client-supplied with no enforced format or
// entropy, and the store below is one shared, unscoped Map — so a caller
// that (by bug or otherwise) reuses a key across a genuinely different
// request must never be handed back a stale reservation for the WRONG
// submission. Each route builds this from the exact fields that determine
// what it submits (including its own provider id, so two routes can never
// collide on a shared key), with a fixed field order so identical requests
// always fingerprint identically.
export const IDEMPOTENCY_KEY_MISMATCH_MESSAGE = 'This idempotencyKey was already used for a different request. Use a new idempotencyKey for a new submission.';

export function isIdempotencyKeyMismatchError(error: unknown): boolean {
  return error instanceof Error && error.message === IDEMPOTENCY_KEY_MISMATCH_MESSAGE;
}

// AIStudioPanel.tsx's client-side RECOVERY_MAX_AGE_MS.submissionOrdinary is
// intentionally kept at (a small safety margin under) this exact value — a
// client recovery entry that outlives its actual server-side reservation
// doesn't resume anything, it silently starts a genuinely new, separately
// billed submission. This is the ceiling for a NON-ambiguous recoverable
// submission (a network-level failure) specifically, since success never
// upgrades a reservation past this TTL. If this changes, that constant must
// change with it.
const TTL_MS = 10 * 60_000;
// An ambiguous (possibly-already-billed) failure gets a much longer window
// than an ordinary in-flight reservation: the whole point of keeping it is to
// let a visitor come back after stepping away to check whether the charge
// went through, and 10 minutes is too short a leash for that. This does not
// make the reservation permanent — it is still a bounded, per-instance cache,
// the same documented tradeoff resultStore/rateLimit make — it just matches
// the window to how long this specific kind of doubt plausibly lasts.
//
// AIStudioPanel.tsx's client-side RECOVERY_MAX_AGE_MS.submissionAmbiguous is
// intentionally kept at (a small safety margin under) this exact value, for
// the same reason as TTL_MS above but for the ambiguous (isSubmitTimeout)
// case specifically. If this changes, that constant must change with it.
const AMBIGUOUS_TTL_MS = 60 * 60_000;
const MAX_ENTRIES = 200;
const store = new Map<string, IdempotencyEntry>();

function prune(): void {
  const now = Date.now();
  for (const [key, value] of store) {
    if (now - value.createdAt > value.ttlMs) store.delete(key);
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
 * A run that fails with a DEFINITE error (the common case) releases its
 * reservation, so a genuinely later attempt can try again fresh — this
 * function only prevents a duplicate for a submission that is still
 * outstanding or already succeeded, not a fresh choice to retry after a
 * known failure. A run that succeeds stays cached for the rest of the TTL,
 * so any later retry — concurrent or not — reconciles to the same job.
 *
 * Some providers (Higgsfield's uncancellable subscribe() call, guarded by
 * isSubmitTimeout in higgsfield.server.ts) can fail in a way that is itself
 * AMBIGUOUS — the request may already have been accepted and billed even
 * though our own wait for it rejected. Releasing the reservation for THAT
 * kind of failure would defeat the whole point: a retry with the same key
 * would see an empty store and start a genuinely second, separately billed
 * submission. `isAmbiguousFailure`, when supplied, identifies such errors so
 * their reservation is kept instead — a retry then reconciles to the SAME
 * (rejected) outcome rather than trying again — and its TTL is extended to
 * AMBIGUOUS_TTL_MS (from the moment the ambiguity was detected), since the
 * whole point is to survive a visitor stepping away before checking back.
 *
 * `fingerprint` binds the reservation to the specific request it was made
 * for. A second call with the same key but a DIFFERENT fingerprint — a
 * reused or guessed key naming a different room, output type, or source —
 * is rejected with IDEMPOTENCY_KEY_MISMATCH_MESSAGE rather than silently
 * handed the wrong caller's job or allowed to bypass the dedupe entirely.
 *
 * With no key supplied (an older client), every call runs independently.
 */
export function reserveIdempotentSubmission(
  key: string | undefined,
  fingerprint: string,
  run: () => Promise<string>,
  options?: { isAmbiguousFailure?: (error: unknown) => boolean },
): Promise<string> {
  if (!key) return run();
  prune();

  const existing = store.get(key);
  if (existing) {
    if (existing.fingerprint !== fingerprint) {
      return Promise.reject(new Error(IDEMPOTENCY_KEY_MISMATCH_MESSAGE));
    }
    return existing.promise;
  }

  while (store.size >= MAX_ENTRIES) {
    const oldest = store.keys().next().value;
    if (oldest === undefined) break;
    store.delete(oldest);
  }

  const promise = run();
  promise.catch((error: unknown) => {
    if (options?.isAmbiguousFailure?.(error)) {
      store.set(key, { promise, createdAt: Date.now(), ttlMs: AMBIGUOUS_TTL_MS, fingerprint });
    } else {
      store.delete(key);
    }
  });
  store.set(key, { promise, createdAt: Date.now(), ttlMs: TTL_MS, fingerprint });
  return promise;
}

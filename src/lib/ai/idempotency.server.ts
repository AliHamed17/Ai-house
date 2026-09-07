import 'server-only';

/**
 * A submission's HTTP response can be lost after the server has already
 * started (and, for a live provider, billed) a real generation — a dropped
 * connection, a client-side timeout, or a proxy hiccup all look identical to
 * the client, which cannot tell "never reached the server" apart from
 * "reached the server, which paid for and completed it, but I never heard
 * back." A client-supplied idempotency key lets a retried request for the
 * exact same submission be recognized here and answered with the job that
 * already exists, instead of starting (and billing) a duplicate one.
 *
 * Like resultStore/rateLimit, this is per-instance, in-memory, and bounded —
 * adequate for reconciling a retry within the same short window a visitor
 * would plausibly retry in; it does not need to survive a cold start.
 */
interface IdempotencyEntry {
  jobId: string;
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

/** The jobId already recorded for this idempotency key, if any and not expired. */
export function getIdempotentJobId(key: string | undefined): string | undefined {
  if (!key) return undefined;
  const entry = store.get(key);
  if (!entry) return undefined;
  if (Date.now() - entry.createdAt > TTL_MS) {
    store.delete(key);
    return undefined;
  }
  return entry.jobId;
}

/** Records the jobId a successful (possibly billed) submission produced, so a retry carrying the same key can be reconciled instead of starting a duplicate. */
export function recordIdempotentJobId(key: string | undefined, jobId: string): void {
  if (!key) return;
  prune();
  while (store.size >= MAX_ENTRIES) {
    const oldest = store.keys().next().value;
    if (oldest === undefined) break;
    store.delete(oldest);
  }
  store.set(key, { jobId, createdAt: Date.now() });
}

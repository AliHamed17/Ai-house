import 'server-only';
import type { GenerationJob, GenerationStatus } from '@/lib/types';

/**
 * Caches a job's TERMINAL status (completed/failed/moderated) the first time
 * it's observed, so a REPLAYED poll for the exact same job id afterward
 * never spends another real, credentialed provider lookup.
 *
 * The per-job-id sliding-window rate limit in the status route (see
 * rateLimit.server's STATUS_MAX_REQUESTS_PER_WINDOW) only bounds the RATE of
 * repeated polling, not its total lifetime — its window keeps resetting
 * forever, so any holder of one legitimately issued job id could otherwise
 * replay this route indefinitely (up to that rate ceiling) even long after
 * the job finished and has nothing new left to report, exhausting the
 * provider account's own API quota (Higgsfield's status() spends a real
 * credentialed request every call) on a job that will never again change.
 *
 * A job's own terminal VERDICT can only ever advance once — none of the
 * providers' own status() implementations ever un-complete, un-fail, or
 * un-moderate a job once it gets there (mock's is a deterministic function
 * of its signed, immutable payload; Higgsfield's and Nano Banana's both only
 * ever move forward). But a 'completed' verdict's resultUrl can still stop
 * WORKING out from under a cached entry: Nano Banana's (and a mock video
 * job's, when sourced from one) resultUrl points into resultStore.server's
 * own short-lived in-memory store, and a FRESH call to that provider's own
 * status() correctly notices the expired bytes and reports 'failed' instead
 * (regression: an earlier version of this cache assumed every terminal
 * verdict was flatly immutable forever, missing that this one specific
 * dependency isn't — a permanently-cached 'completed' would keep serving a
 * permanently-404ing resultUrl). CACHE_TTL_MS below bounds how long a cached
 * entry is trusted before falling back to a fresh lookup, matching
 * resultStore's own TTL_MS — measured from the job's own createdAt (baked
 * into its id at submit time, and always present on the GenerationJob every
 * provider's status() returns — see jobId.ts and each provider's own
 * status()), not from whenever this cache first happened to observe it
 * (regression: an earlier version measured from that first-observed time
 * instead, so a job whose first terminal poll was itself delayed — e.g. a
 * submission recovered and resumed well after it had actually already
 * completed server-side — could still be served as freshly 'completed' for
 * up to another full TTL_MS after the underlying result bytes, timed from
 * that SAME submission, had already expired). Higgsfield's own hosted
 * resultUrl has no such dependency, but this deliberately revalidates it too
 * rather than trying to special-case which providers' completions are truly
 * permanent — one real (but rare) extra provider call is a far smaller cost
 * than getting that special-casing wrong.
 */
export function isTerminalStatus(status: GenerationStatus): boolean {
  return status === 'completed' || status === 'failed' || status === 'moderated';
}

// Matches resultStore.server's own TTL_MS — see this module's own doc
// comment for why a cached 'completed' entry can't be trusted any longer
// than the underlying result bytes it points to are guaranteed to exist. If
// that changes, this must change with it.
const CACHE_TTL_MS = 10 * 60_000;
const MAX_ENTRIES = 500;
// Map preserves insertion order, so the first key is always the
// longest-cached entry — evicting it on overflow is a simple, correct FIFO
// bound. Unlike idempotency.server's reservation store, there is no
// billing-safety reason to ever refuse an insert here: evicting a cached
// terminal status just means its NEXT poll (if one ever comes) falls
// through to a fresh, real provider lookup — exactly the pre-existing,
// already-safe behavior for any job that was never cached in the first
// place, not a new failure mode.
const cache = new Map<string, GenerationJob>();

export function getCachedTerminalStatus(jobId: string): GenerationJob | undefined {
  const job = cache.get(jobId);
  if (!job) return undefined;
  if (Date.now() - new Date(job.createdAt).getTime() > CACHE_TTL_MS) {
    cache.delete(jobId);
    return undefined;
  }
  return job;
}

export function cacheTerminalStatus(jobId: string, job: GenerationJob): void {
  if (!isTerminalStatus(job.status)) return;
  if (!cache.has(jobId) && cache.size >= MAX_ENTRIES) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey !== undefined) cache.delete(oldestKey);
  }
  cache.set(jobId, job);
}

/** Test-only: resets the module-level cache so capacity/eviction tests start from a clean slate. */
export function _clearStatusCacheForTests(): void {
  cache.clear();
}

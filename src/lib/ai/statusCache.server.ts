import 'server-only';
import { resultIdFromPath } from './resultStore.server';
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
 * This is the cache's WHOLE point, so a cached entry must stay valid for as
 * long as the job itself is meaningfully "done" — including long after
 * CACHE_TTL_MS below, for any job with nothing ephemeral to go stale.
 *
 * A job's own terminal VERDICT can only ever advance once — none of the
 * providers' own status() implementations ever un-complete, un-fail, or
 * un-moderate a job once it gets there (mock's is a deterministic function
 * of its signed, immutable payload; Higgsfield's and Nano Banana's both only
 * ever move forward). But a 'completed' verdict's resultUrl can still stop
 * WORKING out from under a cached entry — specifically when that resultUrl
 * points into resultStore.server's own short-lived in-memory store (Nano
 * Banana's always does; a mock video job's does only when sourced from a
 * genuinely stored result): a FRESH call to that provider's own status()
 * correctly notices the expired bytes and reports 'failed' instead
 * (regression: an earlier version of this cache assumed every terminal
 * verdict was flatly immutable forever, missing that this one specific
 * dependency isn't — a permanently-cached 'completed' would keep serving a
 * permanently-404ing resultUrl). needsRevalidation below identifies exactly
 * that dependency via resultIdFromPath — the one objective, checkable signal
 * for "this resultUrl is ours and expires with resultStore's own TTL_MS" —
 * rather than guessing from the provider name: Higgsfield's own hosted
 * resultUrl (and a mock job's static placeholder-concept path) has no such
 * dependency and must NOT be forced through CACHE_TTL_MS regardless of the
 * job's own age (regression: an earlier version applied CACHE_TTL_MS to
 * EVERY job unconditionally, measured from the job's own createdAt — so any
 * terminal job older than CACHE_TTL_MS, Higgsfield's included, was evicted on
 * its very next poll and fell straight back to a real provider call,
 * defeating this cache's entire quota-protection purpose for exactly the
 * old, long-since-finished jobs a replay attack would actually target).
 * CACHE_TTL_MS matches resultStore's own TTL_MS, measured from the job's own
 * createdAt (baked into its id at submit time, and always present on the
 * GenerationJob every provider's status() returns — see jobId.ts and each
 * provider's own status()), not from whenever this cache first happened to
 * observe the job as terminal — a job whose first terminal poll was itself
 * delayed (e.g. a submission recovered and resumed well after it had
 * actually already completed server-side) must not be served as freshly
 * 'completed' for another full TTL_MS past when the underlying result bytes,
 * timed from that SAME submission, had already expired.
 */
export function isTerminalStatus(status: GenerationStatus): boolean {
  return status === 'completed' || status === 'failed' || status === 'moderated';
}

// See needsRevalidation below for why only some completed jobs are ever
// subject to this at all.
const CACHE_TTL_MS = 60 * 60_000;
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

// True only for a completed job whose resultUrl is a
// `/api/generation/result/<id>` path into resultStore.server's own
// short-lived store — the one case whose bytes can actually expire out from
// under an otherwise-immutable terminal verdict. Anything else (Higgsfield's
// own hosted URL, a mock job's static placeholder-concept path, or any
// failed/moderated job with no resultUrl at all) can be trusted for as long
// as this cache keeps it around, with no TTL of its own.
function needsRevalidation(job: GenerationJob): boolean {
  return job.status === 'completed' && Boolean(job.resultUrl && resultIdFromPath(job.resultUrl));
}

export function getCachedTerminalStatus(jobId: string): GenerationJob | undefined {
  const job = cache.get(jobId);
  if (!job) return undefined;
  if (needsRevalidation(job) && Date.now() - new Date(job.createdAt).getTime() > CACHE_TTL_MS) {
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

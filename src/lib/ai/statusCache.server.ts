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
 * A job's status can only ever ADVANCE to a terminal state once — none of
 * the providers' own status() implementations ever un-complete, un-fail, or
 * un-moderate a job once it gets there (mock's is a deterministic function
 * of its signed, immutable payload; Higgsfield's and Nano Banana's both only
 * ever move forward). So caching the first terminal observation is always
 * safe to serve for every later poll of that same id — there is no
 * "staleness" risk the way there would be for a still in-progress status.
 */
export function isTerminalStatus(status: GenerationStatus): boolean {
  return status === 'completed' || status === 'failed' || status === 'moderated';
}

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
  return cache.get(jobId);
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

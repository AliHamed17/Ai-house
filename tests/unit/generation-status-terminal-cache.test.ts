import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

// Regression coverage for the finding that STATUS_MAX_REQUESTS_PER_WINDOW
// alone doesn't actually bound a job's replay lifetime: its sliding window
// resets forever, so any holder of one legitimately issued (but long since
// terminal) job id could keep replaying this route past that ceiling,
// exhausting a live provider's own credentialed API quota on a job that will
// never again report anything new. Caching a job's first-observed terminal
// status (see statusCache.server.ts) closes that off by never touching the
// provider — or the rate limiter — again for that same id.
describe('GET /api/generation/status/[id] caches a TERMINAL status, never re-spending a provider lookup on a replayed job id (regression)', () => {
  afterEach(() => {
    vi.resetModules();
  });

  function makeRequest(id: string): NextRequest {
    return new NextRequest(`http://localhost:3000/api/generation/status/${id}`);
  }

  it('serves a completed job from cache well past STATUS_MAX_REQUESTS_PER_WINDOW replays, never returning 429', async () => {
    vi.resetModules();
    const { GET } = await import('@/app/api/generation/status/[id]/route');
    const { encodeJobId } = await import('@/lib/ai/jobId');
    const { STATUS_MAX_REQUESTS_PER_WINDOW } = await import('@/lib/ai/rateLimit.server');

    const jobId = encodeJobId({
      provider: 'mock',
      roomId: 'living',
      outputType: 'image',
      styleVariant: 'warm-oak',
      prompt: 'p-terminal-replay',
      // Already well past mockProvider's IN_PROGRESS_UNTIL_MS — every poll
      // observes 'completed' immediately, so the very first one caches it.
      createdAt: Date.now() - 10_000,
      simulate: 'success',
    });

    // Comfortably more than the rate-limit ceiling — if caching were NOT
    // short-circuiting the rate limiter, this would eventually 429.
    const replayCount = STATUS_MAX_REQUESTS_PER_WINDOW * 3;
    for (let i = 0; i < replayCount; i++) {
      const res = await GET(makeRequest(jobId), { params: Promise.resolve({ id: jobId }) });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe('completed');
      expect(body.jobId).toBe(jobId);
    }
  });

  it("never caches a still in-progress status, so a genuinely active job keeps getting FRESH lookups (regression: caching must not freeze a job before it's actually done)", async () => {
    vi.resetModules();
    const { GET } = await import('@/app/api/generation/status/[id]/route');
    const { encodeJobId } = await import('@/lib/ai/jobId');

    const jobId = encodeJobId({
      provider: 'mock',
      roomId: 'living',
      outputType: 'image',
      styleVariant: 'warm-oak',
      prompt: 'p-still-queued',
      createdAt: Date.now(),
      simulate: 'success',
    });

    const res = await GET(makeRequest(jobId), { params: Promise.resolve({ id: jobId }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('queued');

    vi.useFakeTimers();
    try {
      // Past mockProvider's IN_PROGRESS_UNTIL_MS — a FRESH lookup now
      // reports 'completed'; a cached 'queued' snapshot would wrongly keep
      // reporting 'queued' forever instead.
      vi.advanceTimersByTime(3_000);
      const later = await GET(makeRequest(jobId), { params: Promise.resolve({ id: jobId }) });
      expect(later.status).toBe(200);
      const laterBody = await later.json();
      expect(laterBody.status).toBe('completed');
    } finally {
      vi.useRealTimers();
    }
  });

  it("revalidates a cached 'completed' Nano Banana status once its cache TTL passes, so an expired result-store entry is correctly reported as failed instead of serving a stale, permanently-404ing resultUrl (regression)", async () => {
    // Nano Banana's 'completed' resultUrl points into resultStore.server's
    // own short-lived store (TTL_MS, 10 min) — a job that was genuinely
    // completed can still stop being fetchable once those bytes expire, even
    // though the terminal VERDICT itself never changes. A cache with no TTL
    // of its own would keep serving that first 'completed' snapshot forever,
    // permanently 404ing the very resultUrl it advertises.
    vi.resetModules();
    const { GET } = await import('@/app/api/generation/status/[id]/route');
    const { encodeJobId } = await import('@/lib/ai/jobId');
    const { putStoredResult } = await import('@/lib/ai/resultStore.server');

    vi.useFakeTimers();
    try {
      const resultKey = putStoredResult('image/png', 'aGVsbG8=');
      const jobId = encodeJobId({
        provider: 'nano-banana',
        roomId: 'living',
        outputType: 'image',
        styleVariant: 'warm-oak',
        prompt: 'p-cache-ttl',
        createdAt: Date.now(),
        nanoBananaResultKey: resultKey,
      });

      const first = await GET(makeRequest(jobId), { params: Promise.resolve({ id: jobId }) });
      const firstBody = await first.json();
      expect(firstBody.status).toBe('completed');
      expect(firstBody.resultUrl).toBeDefined();

      // Past both resultStore's own TTL_MS and the status cache's matching
      // CACHE_TTL_MS (they're deliberately kept equal — see
      // statusCache.server's own doc comment).
      vi.advanceTimersByTime(11 * 60_000);

      const second = await GET(makeRequest(jobId), { params: Promise.resolve({ id: jobId }) });
      const secondBody = await second.json();
      expect(secondBody.status).toBe('failed');
      expect(secondBody.error).toMatch(/expired/i);
    } finally {
      vi.useRealTimers();
    }
  });

  it("expires a cached 'completed' status from the job's own createdAt, not from whenever its first poll happened to land (regression)", async () => {
    // A submission recovered and resumed well after it had actually already
    // completed server-side (see AIStudioPanel's own submission-recovery
    // flow) means this route's FIRST ever look at a job's status can itself
    // already be minutes after the job — and the result-store bytes it
    // depends on — were actually created. Anchoring the cache's own TTL to
    // that first-observed moment instead of the job's real createdAt would
    // keep serving 'completed' for up to another full CACHE_TTL_MS AFTER the
    // underlying resultStore entry, timed from the SAME real creation, has
    // already expired — exactly the stale-404ing-resultUrl bug the sibling
    // test above guards against, just reached through a delayed first poll
    // instead of a delayed second one.
    vi.resetModules();
    const { GET } = await import('@/app/api/generation/status/[id]/route');
    const { encodeJobId } = await import('@/lib/ai/jobId');
    const { putStoredResult } = await import('@/lib/ai/resultStore.server');

    vi.useFakeTimers();
    try {
      const resultKey = putStoredResult('image/png', 'aGVsbG8=');
      const jobId = encodeJobId({
        provider: 'nano-banana',
        roomId: 'living',
        outputType: 'image',
        styleVariant: 'warm-oak',
        prompt: 'p-cache-ttl-delayed-first-poll',
        createdAt: Date.now(),
        nanoBananaResultKey: resultKey,
      });

      // The FIRST poll is itself delayed by 9 minutes — well within
      // resultStore's own 10-minute TTL (measured from the same createdAt
      // above), so this still genuinely observes 'completed'.
      vi.advanceTimersByTime(9 * 60_000);
      const first = await GET(makeRequest(jobId), { params: Promise.resolve({ id: jobId }) });
      const firstBody = await first.json();
      expect(firstBody.status).toBe('completed');

      // Only 2 more minutes pass — comfortably under CACHE_TTL_MS measured
      // from this first observation, but 11 minutes past the job's real
      // createdAt, past both resultStore's TTL_MS and the status cache's own
      // matching CACHE_TTL_MS measured correctly from THAT origin.
      vi.advanceTimersByTime(2 * 60_000);
      const second = await GET(makeRequest(jobId), { params: Promise.resolve({ id: jobId }) });
      const secondBody = await second.json();
      expect(secondBody.status).toBe('failed');
      expect(secondBody.error).toMatch(/expired/i);
    } finally {
      vi.useRealTimers();
    }
  });

  it('serves an already-old completed job with a NON-ephemeral resultUrl from cache forever, never falling through to the rate limiter once past CACHE_TTL_MS (regression)', async () => {
    // The createdAt-anchored TTL fix above is only meant to bound a
    // resultStore-backed resultUrl (Nano Banana's, or a mock video job's
    // when sourced from one) — this job's own resultUrl is the STATIC
    // placeholder-concept path (no approved source, mockSourceResultPath
    // unset), exactly the same non-ephemeral shape Higgsfield's own hosted
    // resultUrl has. Applying that same TTL unconditionally to every job
    // (an earlier version of this fix did) would evict this cache entry the
    // moment it turns ten minutes old regardless of what its resultUrl
    // actually depends on, falling through to the rate limiter on every
    // later replay and defeating this cache's entire quota-protection
    // purpose for precisely the old, long-since-finished jobs a replay
    // attack would target.
    vi.resetModules();
    const { GET } = await import('@/app/api/generation/status/[id]/route');
    const { encodeJobId } = await import('@/lib/ai/jobId');
    const { STATUS_MAX_REQUESTS_PER_WINDOW } = await import('@/lib/ai/rateLimit.server');

    const jobId = encodeJobId({
      provider: 'mock',
      roomId: 'living',
      outputType: 'image',
      styleVariant: 'warm-oak',
      prompt: 'p-non-ephemeral-old',
      // Already well past CACHE_TTL_MS (10 min) at the very first poll.
      createdAt: Date.now() - 20 * 60_000,
      simulate: 'success',
    });

    // Comfortably more than the rate-limit ceiling — if the cache were
    // incorrectly evicting this entry for being "too old", this would
    // eventually 429 just like the sibling test at the top of this file.
    const replayCount = STATUS_MAX_REQUESTS_PER_WINDOW * 3;
    for (let i = 0; i < replayCount; i++) {
      const res = await GET(makeRequest(jobId), { params: Promise.resolve({ id: jobId }) });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe('completed');
      expect(body.resultUrl).toMatch(/^\/generated\/concepts\//);
    }
  });
});

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
});

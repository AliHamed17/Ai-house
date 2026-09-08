import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

// Job id signing (see jobId.ts) already stops a FORGED id from ever reaching
// a provider — but says nothing about how many times a GENUINE id can be
// replayed. These tests exercise that separate concern directly: once any
// one job id is issued, this route must bound how many times it can be
// polled, without that bound leaking onto (and throttling) any OTHER job.
describe('GET /api/generation/status/[id] rate-limits repeated checks of the SAME job id (regression)', () => {
  afterEach(() => {
    vi.resetModules();
  });

  function makeRequest(id: string): NextRequest {
    return new NextRequest(`http://localhost:3000/api/generation/status/${id}`);
  }

  async function freshMockJobId(seed: string): Promise<string> {
    const { encodeJobId } = await import('@/lib/ai/jobId');
    // createdAt far enough in the past that mockProvider.status() resolves
    // 'completed' immediately — no timers needed for a deterministic test.
    // seed varies the prompt so two calls (even in the same millisecond)
    // never collide on an identical payload/signature.
    return encodeJobId({
      provider: 'mock',
      roomId: 'living',
      outputType: 'image',
      styleVariant: 'warm-oak',
      prompt: `p-${seed}`,
      createdAt: Date.now() - 10_000,
      simulate: 'success',
    });
  }

  it('allows normal polling of a job well under the ceiling', async () => {
    vi.resetModules();
    const { GET } = await import('@/app/api/generation/status/[id]/route');
    const jobId = await freshMockJobId('normal-polling');

    for (let i = 0; i < 5; i++) {
      const res = await GET(makeRequest(jobId), { params: Promise.resolve({ id: jobId }) });
      expect(res.status).toBe(200);
    }
  });

  it('returns 429 once a single job id is polled past STATUS_MAX_REQUESTS_PER_WINDOW, and does not throttle a DIFFERENT job id', async () => {
    vi.resetModules();
    const { GET } = await import('@/app/api/generation/status/[id]/route');
    const { STATUS_MAX_REQUESTS_PER_WINDOW } = await import('@/lib/ai/rateLimit.server');
    const jobId = await freshMockJobId('exhaust-this-one');

    for (let i = 0; i < STATUS_MAX_REQUESTS_PER_WINDOW; i++) {
      const res = await GET(makeRequest(jobId), { params: Promise.resolve({ id: jobId }) });
      expect(res.status).toBe(200);
    }
    const blocked = await GET(makeRequest(jobId), { params: Promise.resolve({ id: jobId }) });
    expect(blocked.status).toBe(429);
    expect((await blocked.json()).error).toMatch(/too many status checks/i);
    expect(blocked.headers.get('Retry-After')).toBeTruthy();

    // A completely different job id (e.g. a second in-flight generation)
    // must not have spent any of its own budget just because another job's
    // was exhausted.
    const otherJobId = await freshMockJobId('a-different-job');
    const otherRes = await GET(makeRequest(otherJobId), { params: Promise.resolve({ id: otherJobId }) });
    expect(otherRes.status).toBe(200);
  });

  it('never allocates rate-limit state for an invalid/unsigned job id, however many distinct ones are tried (regression)', async () => {
    // checkRateLimit's own sweep walks its ENTIRE map on every call (see
    // rateLimit.server.ts) — keying it by an id BEFORE verifying the
    // signature would let an unauthenticated caller flood distinct garbage
    // ids to grow that map without bound, turning every later request's
    // sweep into ever more work with no valid job id required at all.
    // Decoding first (see the route) means only a genuinely-signed id ever
    // creates an entry here.
    vi.resetModules();
    const { GET } = await import('@/app/api/generation/status/[id]/route');
    const { _trackedClientKeyCountForTests } = await import('@/lib/ai/rateLimit.server');

    for (let i = 0; i < 50; i++) {
      const id = `garbage-${i}`;
      const res = await GET(makeRequest(id), { params: Promise.resolve({ id }) });
      expect(res.status).toBe(404);
    }
    expect(_trackedClientKeyCountForTests()).toBe(0);
  });
});

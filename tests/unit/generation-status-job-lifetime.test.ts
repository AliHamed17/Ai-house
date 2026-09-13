import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from '@/app/api/generation/status/[id]/route';
import { encodeJobId } from '@/lib/ai/jobId';

// Regression coverage for the finding that statusCache's own MAX_ENTRIES
// FIFO eviction bounds memory, not a job's total lifetime of real provider
// lookups: once more than MAX_ENTRIES distinct terminal jobs have been
// observed, a holder who accumulates and cycles through enough valid ids
// could keep forcing even an old, otherwise-permanently-cacheable job back
// out to a fresh, credentialed provider call on every poll, regardless of
// caching. A hard age ceiling on the job id's own encoded createdAt — fully
// independent of cache state — closes that off.
describe('GET /api/generation/status/[id] refuses to spend a provider call on a job past its own lifetime ceiling (regression)', () => {
  function makeRequest(id: string): NextRequest {
    return new NextRequest(`http://localhost:3000/api/generation/status/${id}`);
  }

  it('returns 410 for a job older than 24h, without ever needing to consult the provider', async () => {
    const jobId = encodeJobId({
      provider: 'mock',
      roomId: 'living',
      outputType: 'image',
      styleVariant: 'warm-oak',
      prompt: 'p-too-old',
      createdAt: Date.now() - (24 * 60 * 60_000 + 60_000),
      simulate: 'success',
    });

    const res = await GET(makeRequest(jobId), { params: Promise.resolve({ id: jobId }) });

    expect(res.status).toBe(410);
    const body = await res.json();
    expect(body.error).toMatch(/too old/i);
  });

  it('still serves a job just under the 24h ceiling normally (baseline for the ceiling above)', async () => {
    const jobId = encodeJobId({
      provider: 'mock',
      roomId: 'living',
      outputType: 'image',
      styleVariant: 'warm-oak',
      prompt: 'p-not-too-old',
      createdAt: Date.now() - (24 * 60 * 60_000 - 60_000),
      simulate: 'success',
    });

    const res = await GET(makeRequest(jobId), { params: Promise.resolve({ id: jobId }) });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('completed');
  });
});

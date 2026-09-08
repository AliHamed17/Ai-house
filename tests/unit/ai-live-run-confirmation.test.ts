import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { LIVE_RUN_NOT_CONFIRMED_MESSAGE } from '@/lib/ai/registry.server';

function makeRequest(url: string, body: unknown): NextRequest {
  return new NextRequest(url, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

// The client only shows its "Yes, generate (may incur cost)" confirmation
// when ITS OWN cached /api/generation/mode probe says the target provider is
// live, but that cache can go stale between the probe and the actual submit
// (a rolling deploy, an env var flip) — the client is directly reachable
// regardless of what it renders, so the route itself must independently
// re-verify whenever its OWN demoMode resolution says a request is about to
// bill a real provider (see registry.server.ts).
describe('POST /api/nano-banana/generate independently re-verifies live-run confirmation before billing (regression)', () => {
  afterEach(() => {
    vi.doUnmock('@/lib/ai/registry.server');
    vi.resetModules();
  });

  it('returns 428 (never calling submit) when demoMode is false and liveRunConfirmed is missing, then succeeds once confirmed with the SAME idempotencyKey', async () => {
    const submitMock = vi.fn().mockResolvedValue({ jobId: 'job-live-confirmed' });
    vi.doMock('@/lib/ai/registry.server', () => ({
      resolveProviderForSubmit: () => ({
        demoMode: false,
        provider: {
          id: 'nano-banana',
          submit: submitMock,
          status: async () => {
            throw new Error('not used in this test');
          },
        },
      }),
      LIVE_RUN_NOT_CONFIRMED_MESSAGE,
    }));
    vi.resetModules();
    const { POST } = await import('@/app/api/nano-banana/generate/route');

    const idempotencyKey = 'nb-live-confirmation-key';
    const res1 = await POST(makeRequest('http://localhost:3000/api/nano-banana/generate', { roomId: 'living', idempotencyKey }));
    expect(res1.status).toBe(428);
    expect((await res1.json()).error).toBe(LIVE_RUN_NOT_CONFIRMED_MESSAGE);
    expect(submitMock).not.toHaveBeenCalled();

    // Nothing was reserved by the rejected attempt above (it returned before
    // ever reaching reserveIdempotentSubmission) — the SAME idempotencyKey
    // must be free to submit fresh once genuinely confirmed, not treated as
    // a retry of an already-resolved (or in-flight) reservation.
    const res2 = await POST(
      makeRequest('http://localhost:3000/api/nano-banana/generate', { roomId: 'living', idempotencyKey, liveRunConfirmed: true }),
    );
    expect(res2.status).toBe(200);
    expect((await res2.json()).jobId).toBe('job-live-confirmed');
    expect(submitMock).toHaveBeenCalledTimes(1);
  });

  it('never gates a genuinely demo-mode submission behind liveRunConfirmed (baseline)', async () => {
    // No mock here — this environment has no GEMINI_API_KEY/AI_ALLOW_LIVE,
    // so resolveProviderForSubmit's real implementation resolves demoMode
    // true, exercising the actual code path an ordinary demo deployment hits.
    vi.resetModules();
    const { POST } = await import('@/app/api/nano-banana/generate/route');
    const res = await POST(
      makeRequest('http://localhost:3000/api/nano-banana/generate', { roomId: 'living', idempotencyKey: 'nb-demo-mode-key' }),
    );
    expect(res.status).toBe(200);
  });
});

describe('POST /api/higgsfield/generate independently re-verifies live-run confirmation before billing (regression)', () => {
  afterEach(() => {
    vi.doUnmock('@/lib/ai/registry.server');
    vi.resetModules();
  });

  it('returns 428 (never calling submit) when demoMode is false and liveRunConfirmed is missing, then succeeds once confirmed with the SAME idempotencyKey', async () => {
    const submitMock = vi.fn().mockResolvedValue({ jobId: 'job-hf-live-confirmed' });
    vi.doMock('@/lib/ai/registry.server', () => ({
      resolveProviderForSubmit: () => ({
        demoMode: false,
        provider: {
          id: 'higgsfield',
          submit: submitMock,
          status: async () => {
            throw new Error('not used in this test');
          },
        },
      }),
      LIVE_RUN_NOT_CONFIRMED_MESSAGE,
    }));
    vi.resetModules();
    const { POST } = await import('@/app/api/higgsfield/generate/route');

    const idempotencyKey = 'hf-live-confirmation-key';
    const body = { roomId: 'living', sourceAssetPath: '/api/generation/result/some-stored-id', idempotencyKey };
    const res1 = await POST(makeRequest('http://localhost:3000/api/higgsfield/generate', body));
    expect(res1.status).toBe(428);
    expect((await res1.json()).error).toBe(LIVE_RUN_NOT_CONFIRMED_MESSAGE);
    expect(submitMock).not.toHaveBeenCalled();

    const res2 = await POST(
      makeRequest('http://localhost:3000/api/higgsfield/generate', { ...body, liveRunConfirmed: true }),
    );
    expect(res2.status).toBe(200);
    expect((await res2.json()).jobId).toBe('job-hf-live-confirmed');
    expect(submitMock).toHaveBeenCalledTimes(1);
  });
});

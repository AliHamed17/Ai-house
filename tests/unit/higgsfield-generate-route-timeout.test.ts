import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

function makeRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost:3000/api/higgsfield/generate', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('isSubmitTimeout (distinguishes an ambiguous, possibly-billed timeout from a definite failure)', () => {
  it('matches only the exact Higgsfield submit-timeout error', async () => {
    const { isSubmitTimeout } = await import('@/lib/ai/higgsfield.server');
    expect(isSubmitTimeout(new Error('Higgsfield submission timed out after 30s'))).toBe(true);
    expect(isSubmitTimeout(new Error('some other error'))).toBe(false);
    expect(isSubmitTimeout('not an Error instance')).toBe(false);
    expect(isSubmitTimeout(undefined)).toBe(false);
  });
});

describe('POST /api/higgsfield/generate (ambiguous-timeout handling)', () => {
  afterEach(() => {
    vi.doUnmock('@/lib/ai/registry.server');
    vi.resetModules();
  });

  it('returns a distinct 504 warning (never the generic failure) when submit times out', async () => {
    // The Higgsfield SDK call cannot be cancelled, so this specific error
    // means the job may have already been accepted and billed server-side
    // even though our client-side wait gave up — the route must not tell
    // the caller it's safe to just retry.
    vi.doMock('@/lib/ai/registry.server', () => ({
      resolveProviderForSubmit: () => ({
        demoMode: false,
        provider: {
          id: 'higgsfield',
          submit: async () => {
            throw new Error('Higgsfield submission timed out after 30s');
          },
          status: async () => {
            throw new Error('not used in this test');
          },
        },
      }),
    }));
    vi.resetModules();
    const { POST } = await import('@/app/api/higgsfield/generate/route');
    const res = await POST(
      makeRequest({ roomId: 'living', sourceAssetPath: '/api/generation/result/some-real-looking-id', liveRunConfirmed: true }),
    );
    expect(res.status).toBe(504);
    const data = await res.json();
    expect(data.error).toMatch(/may have already been accepted/i);
  });

  it('retrying with the same idempotencyKey after a timeout never calls provider.submit again (regression)', async () => {
    // The Higgsfield SDK call cannot be cancelled, so a retry after this
    // exact failure must not be allowed to start a second, separately
    // billed submission — even though the first one "failed" from this
    // route's point of view.
    const submitMock = vi.fn().mockRejectedValue(new Error('Higgsfield submission timed out after 30s'));
    vi.doMock('@/lib/ai/registry.server', () => ({
      resolveProviderForSubmit: () => ({
        demoMode: false,
        provider: { id: 'higgsfield', submit: submitMock, status: async () => { throw new Error('not used in this test'); } },
      }),
    }));
    vi.resetModules();
    const { POST } = await import('@/app/api/higgsfield/generate/route');

    const body = {
      roomId: 'living',
      sourceAssetPath: '/api/generation/result/some-real-looking-id',
      idempotencyKey: 'hf-timeout-retry-key',
      liveRunConfirmed: true,
    };
    const res1 = await POST(makeRequest(body));
    expect(res1.status).toBe(504);
    const res2 = await POST(makeRequest(body));
    expect(res2.status).toBe(504);
    expect((await res2.json()).error).toMatch(/may have already been accepted/i);

    expect(submitMock).toHaveBeenCalledTimes(1);
  });

  it('still returns the generic 502 failure for a non-timeout submit error', async () => {
    vi.doMock('@/lib/ai/registry.server', () => ({
      resolveProviderForSubmit: () => ({
        demoMode: false,
        provider: {
          id: 'higgsfield',
          submit: async () => {
            throw new Error('Higgsfield credentials are not configured (set HF_CREDENTIALS).');
          },
          status: async () => {
            throw new Error('not used in this test');
          },
        },
      }),
    }));
    vi.resetModules();
    const { POST } = await import('@/app/api/higgsfield/generate/route');
    const res = await POST(
      makeRequest({ roomId: 'living', sourceAssetPath: '/api/generation/result/some-real-looking-id', liveRunConfirmed: true }),
    );
    expect(res.status).toBe(502);
    const data = await res.json();
    expect(data.error).not.toMatch(/may have already been accepted/i);
  });
});

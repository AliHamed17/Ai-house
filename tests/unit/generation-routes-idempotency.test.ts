import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

function makeRequest(url: string, body: unknown): NextRequest {
  return new NextRequest(url, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('idempotency reconciliation on the generation routes (a lost response must not risk a duplicate billed job)', () => {
  afterEach(() => {
    vi.doUnmock('@/lib/ai/registry.server');
    vi.resetModules();
  });

  it('POST /api/nano-banana/generate: retrying with the same idempotencyKey never calls provider.submit twice', async () => {
    const submitMock = vi.fn().mockResolvedValue({ jobId: 'job-nb-1' });
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
    }));
    vi.resetModules();
    const { POST } = await import('@/app/api/nano-banana/generate/route');

    const body = { roomId: 'living', idempotencyKey: 'nb-retry-key-1' };
    const res1 = await POST(makeRequest('http://localhost:3000/api/nano-banana/generate', body));
    const data1 = await res1.json();
    const res2 = await POST(makeRequest('http://localhost:3000/api/nano-banana/generate', body));
    const data2 = await res2.json();

    expect(submitMock).toHaveBeenCalledTimes(1);
    expect(data1.jobId).toBe('job-nb-1');
    expect(data2.jobId).toBe('job-nb-1');
  });

  it('POST /api/higgsfield/generate: retrying with the same idempotencyKey never calls provider.submit twice', async () => {
    const submitMock = vi.fn().mockResolvedValue({ jobId: 'job-hf-1' });
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
    }));
    vi.resetModules();
    const { POST } = await import('@/app/api/higgsfield/generate/route');

    const body = { roomId: 'living', sourceAssetPath: '/api/generation/result/some-real-looking-id', idempotencyKey: 'hf-retry-key-1' };
    const res1 = await POST(makeRequest('http://localhost:3000/api/higgsfield/generate', body));
    const data1 = await res1.json();
    const res2 = await POST(makeRequest('http://localhost:3000/api/higgsfield/generate', body));
    const data2 = await res2.json();

    expect(submitMock).toHaveBeenCalledTimes(1);
    expect(data1.jobId).toBe('job-hf-1');
    expect(data2.jobId).toBe('job-hf-1');
  });

  it('POST /api/nano-banana/generate: two concurrent requests with the same idempotencyKey never both call provider.submit (regression)', async () => {
    // Simulates a client retrying immediately — before the FIRST request's
    // provider.submit() has even resolved — which is exactly the window a
    // check-then-record (rather than reserve-before-await) implementation
    // fails to close.
    let resolveSubmit: (value: { jobId: string }) => void = () => {};
    const submitPromise = new Promise<{ jobId: string }>((resolve) => {
      resolveSubmit = resolve;
    });
    const submitMock = vi.fn(() => submitPromise);
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
    }));
    vi.resetModules();
    const { POST } = await import('@/app/api/nano-banana/generate/route');

    const body = { roomId: 'living', idempotencyKey: 'nb-concurrent-key-1' };
    const p1 = POST(makeRequest('http://localhost:3000/api/nano-banana/generate', body));
    const p2 = POST(makeRequest('http://localhost:3000/api/nano-banana/generate', body));
    // Let both requests' own async work (reading the request body, etc.)
    // fully drain — so both have reached (and the second has joined) the
    // reservation — before resolving the shared submit call.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(submitMock).toHaveBeenCalledTimes(1);

    resolveSubmit({ jobId: 'job-nb-concurrent' });
    const [data1, data2] = await Promise.all([p1.then((r) => r.json()), p2.then((r) => r.json())]);
    expect(data1.jobId).toBe('job-nb-concurrent');
    expect(data2.jobId).toBe('job-nb-concurrent');
    expect(submitMock).toHaveBeenCalledTimes(1);
  });

  it('two distinct idempotency keys are never reconciled together', async () => {
    const submitMock = vi.fn().mockResolvedValueOnce({ jobId: 'job-x' }).mockResolvedValueOnce({ jobId: 'job-y' });
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
    }));
    vi.resetModules();
    const { POST } = await import('@/app/api/nano-banana/generate/route');

    const res1 = await POST(makeRequest('http://localhost:3000/api/nano-banana/generate', { roomId: 'living', idempotencyKey: 'distinct-key-x' }));
    const res2 = await POST(makeRequest('http://localhost:3000/api/nano-banana/generate', { roomId: 'living', idempotencyKey: 'distinct-key-y' }));

    expect(submitMock).toHaveBeenCalledTimes(2);
    expect((await res1.json()).jobId).toBe('job-x');
    expect((await res2.json()).jobId).toBe('job-y');
  });

  it('POST /api/nano-banana/generate: reusing the same idempotencyKey for a DIFFERENT room is rejected (409), never returning the first room’s job (regression)', async () => {
    const submitMock = vi.fn().mockResolvedValueOnce({ jobId: 'job-room-living' }).mockResolvedValueOnce({ jobId: 'job-should-not-run' });
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
    }));
    vi.resetModules();
    const { POST } = await import('@/app/api/nano-banana/generate/route');

    const res1 = await POST(makeRequest('http://localhost:3000/api/nano-banana/generate', { roomId: 'living', idempotencyKey: 'reused-key-mismatch' }));
    expect(res1.status).toBe(200);
    expect((await res1.json()).jobId).toBe('job-room-living');

    // Same key, a genuinely different request (different room) — must be
    // refused, not silently handed the "living" job nor allowed to start a
    // second, separately billed submission under the same key.
    const res2 = await POST(makeRequest('http://localhost:3000/api/nano-banana/generate', { roomId: 'kitchen', idempotencyKey: 'reused-key-mismatch' }));
    expect(res2.status).toBe(409);
    expect((await res2.json()).error).toMatch(/already used for a different request/i);
    expect(submitMock).toHaveBeenCalledTimes(1);
  });

  it('POST /api/higgsfield/generate: reusing the same idempotencyKey for a DIFFERENT source is rejected (409) (regression)', async () => {
    const submitMock = vi.fn().mockResolvedValueOnce({ jobId: 'job-source-a' }).mockResolvedValueOnce({ jobId: 'job-should-not-run' });
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
    }));
    vi.resetModules();
    const { POST } = await import('@/app/api/higgsfield/generate/route');

    const body1 = { roomId: 'living', sourceAssetPath: '/api/generation/result/source-a', idempotencyKey: 'hf-reused-key-mismatch' };
    const res1 = await POST(makeRequest('http://localhost:3000/api/higgsfield/generate', body1));
    expect(res1.status).toBe(200);
    expect((await res1.json()).jobId).toBe('job-source-a');

    const body2 = { roomId: 'living', sourceAssetPath: '/api/generation/result/source-b', idempotencyKey: 'hf-reused-key-mismatch' };
    const res2 = await POST(makeRequest('http://localhost:3000/api/higgsfield/generate', body2));
    expect(res2.status).toBe(409);
    expect((await res2.json()).error).toMatch(/already used for a different request/i);
    expect(submitMock).toHaveBeenCalledTimes(1);
  });
});

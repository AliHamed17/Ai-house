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
});

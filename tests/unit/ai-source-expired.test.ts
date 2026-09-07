import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const generateContentMock = vi.fn();

vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    models = { generateContent: generateContentMock };
  },
  Modality: { IMAGE: 'IMAGE' },
}));

const ORIGINAL_ENV = { ...process.env };

function makeRequest(url: string, body: unknown): NextRequest {
  return new NextRequest(url, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('SOURCE_EXPIRED_MESSAGE / isSourceExpiredError (shared across both provider adapters)', () => {
  it('recognizes exactly the shared message and nothing else', async () => {
    const { SOURCE_EXPIRED_MESSAGE, isSourceExpiredError } = await import('@/lib/ai/resultStore.server');
    expect(isSourceExpiredError(new Error(SOURCE_EXPIRED_MESSAGE))).toBe(true);
    expect(isSourceExpiredError(new Error('some other failure'))).toBe(false);
    expect(isSourceExpiredError('not an Error instance')).toBe(false);
    expect(isSourceExpiredError(undefined)).toBe(false);
  });
});

describe('nanoBananaProvider.submit source-read failures (distinguishes expired-stored-result from a static-asset read failure)', () => {
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    generateContentMock.mockReset();
    vi.resetModules();
  });

  it('throws SOURCE_EXPIRED_MESSAGE for a stored-result path whose id no longer exists', async () => {
    process.env.GEMINI_API_KEY = 'test-key-not-real';
    vi.resetModules();
    const { nanoBananaProvider } = await import('@/lib/ai/nanoBanana.server');
    const { SOURCE_EXPIRED_MESSAGE } = await import('@/lib/ai/resultStore.server');

    await expect(
      nanoBananaProvider.submit({
        provider: 'nano-banana',
        outputType: 'image',
        roomId: 'living',
        styleVariant: 'warm-oak',
        prompt: 'test prompt',
        sourceAssetPath: '/api/generation/result/not-a-real-id',
      }),
    ).rejects.toThrow(SOURCE_EXPIRED_MESSAGE);
    // A source-read failure must fail before the paid generateContent call,
    // never spend a paid generation on a request known to be unusable.
    expect(generateContentMock).not.toHaveBeenCalled();
  });

  it('throws a DIFFERENT, non-"regenerate"-implying message for a static asset that fails to read (regression)', async () => {
    // There is no earlier concept to regenerate in this case — this is the
    // very first generation, sourced from a static evidence frame — so it
    // must not be mistaken for (or reported as) an expired approval.
    process.env.GEMINI_API_KEY = 'test-key-not-real';
    vi.resetModules();
    const { nanoBananaProvider } = await import('@/lib/ai/nanoBanana.server');
    const { isSourceExpiredError } = await import('@/lib/ai/resultStore.server');

    try {
      await nanoBananaProvider.submit({
        provider: 'nano-banana',
        outputType: 'image',
        roomId: 'living',
        styleVariant: 'warm-oak',
        prompt: 'test prompt',
        // An unsupported extension so readPublicFileAsBase64 fails fast
        // without needing real disk I/O.
        sourceAssetPath: '/evidence/frames/not-a-real-file.txt',
      });
      throw new Error('expected submit() to reject');
    } catch (error) {
      expect(isSourceExpiredError(error)).toBe(false);
      expect((error as Error).message).not.toMatch(/regenerate/i);
    }
    expect(generateContentMock).not.toHaveBeenCalled();
  });
});

describe('POST /api/nano-banana/generate returns a 410 (never the generic 502) for an expired approved source', () => {
  afterEach(() => {
    vi.doUnmock('@/lib/ai/registry.server');
    vi.resetModules();
  });

  it('maps SOURCE_EXPIRED_MESSAGE to 410, and a retry with the same idempotencyKey calls submit again (not ambiguous, unlike a timeout)', async () => {
    const submitMock = vi
      .fn()
      .mockRejectedValueOnce(new Error('The approved source image has expired from the server cache. Please regenerate and re-approve it, then try again.'))
      .mockResolvedValueOnce({ jobId: 'job-after-fresh-source' });
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

    const body = { roomId: 'living', sourceAssetPath: '/api/generation/result/expired-id', idempotencyKey: 'nb-source-expired-key' };
    const res1 = await POST(makeRequest('http://localhost:3000/api/nano-banana/generate', body));
    expect(res1.status).toBe(410);
    expect((await res1.json()).error).toMatch(/expired/i);

    // Nothing was billed, so a retry (the client clears the stale
    // approvedSource and the visitor generates again) must be allowed to run
    // a genuinely new submission — not reconciled to the same rejection.
    const res2 = await POST(makeRequest('http://localhost:3000/api/nano-banana/generate', body));
    expect(res2.status).toBe(200);
    expect((await res2.json()).jobId).toBe('job-after-fresh-source');
    expect(submitMock).toHaveBeenCalledTimes(2);
  });
});

describe('POST /api/higgsfield/generate returns a 410 (never the generic 502) for an expired approved source', () => {
  afterEach(() => {
    vi.doUnmock('@/lib/ai/registry.server');
    vi.resetModules();
  });

  it('maps SOURCE_EXPIRED_MESSAGE to 410, and a retry with the same idempotencyKey calls submit again (not ambiguous, unlike isSubmitTimeout)', async () => {
    const submitMock = vi
      .fn()
      .mockRejectedValueOnce(new Error('The approved source image has expired from the server cache. Please regenerate and re-approve it, then try again.'))
      .mockResolvedValueOnce({ jobId: 'job-hf-after-fresh-source' });
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

    const body = { roomId: 'living', sourceAssetPath: '/api/generation/result/expired-id', idempotencyKey: 'hf-source-expired-key' };
    const res1 = await POST(makeRequest('http://localhost:3000/api/higgsfield/generate', body));
    expect(res1.status).toBe(410);
    expect((await res1.json()).error).toMatch(/expired/i);

    const res2 = await POST(makeRequest('http://localhost:3000/api/higgsfield/generate', body));
    expect(res2.status).toBe(200);
    expect((await res2.json()).jobId).toBe('job-hf-after-fresh-source');
    expect(submitMock).toHaveBeenCalledTimes(2);
  });
});

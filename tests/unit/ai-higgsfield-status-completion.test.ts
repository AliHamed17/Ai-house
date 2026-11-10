import { afterEach, describe, expect, it, vi } from 'vitest';

const ORIGINAL_ENV = { ...process.env };

describe("higgsfieldProvider.status downgrades a premature 'completed' response", () => {
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("reports in_progress (not completed) when Higgsfield's own response says 'completed' but video.url is not yet populated, so it is never cached as a permanent terminal result with nothing to show (regression)", async () => {
    // Higgsfield can report status: 'completed' as a race ahead of actually
    // populating video.url. Trusting that response as genuinely terminal
    // would render neither the video nor Approve/Reject, and — since
    // statusCache.server.ts caches every terminal verdict as permanent —
    // would permanently lose the ability to ever surface the real result
    // once the URL later does appear.
    vi.resetModules();
    process.env.HF_CREDENTIALS = 'test-key:test-secret';
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'completed' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { higgsfieldProvider } = await import('@/lib/ai/higgsfield.server');
    const { encodeJobId } = await import('@/lib/ai/jobId');

    const jobId = encodeJobId({
      provider: 'higgsfield',
      roomId: 'living',
      outputType: 'video',
      styleVariant: 'warm-oak',
      prompt: 'a cozy reading nook',
      createdAt: Date.now(),
      higgsfieldRequestId: 'req-completed-no-url',
    });

    const job = await higgsfieldProvider.status(jobId);

    expect(job.status).toBe('in_progress');
    expect(job.resultUrl).toBeUndefined();
  });

  it('still reports completed, with its resultUrl, once video.url is genuinely present (baseline for the regression above)', async () => {
    vi.resetModules();
    process.env.HF_CREDENTIALS = 'test-key:test-secret';
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'completed', video: { url: 'https://cdn.example.com/clip.mp4' } }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { higgsfieldProvider } = await import('@/lib/ai/higgsfield.server');
    const { encodeJobId } = await import('@/lib/ai/jobId');

    const jobId = encodeJobId({
      provider: 'higgsfield',
      roomId: 'living',
      outputType: 'video',
      styleVariant: 'warm-oak',
      prompt: 'a cozy reading nook',
      createdAt: Date.now(),
      higgsfieldRequestId: 'req-completed-with-url',
    });

    const job = await higgsfieldProvider.status(jobId);

    expect(job.status).toBe('completed');
    expect(job.resultUrl).toBe('https://cdn.example.com/clip.mp4');
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';

const ORIGINAL_ENV = { ...process.env };

// Integration-level coverage for the actual vulnerable code path Codex
// flagged (higgsfield.server.ts's status()), on top of the pure-function
// unit tests in ai-job-id-signing.test.ts and ai-higgsfield-url.test.ts.
// These prove the two defense-in-depth layers are genuinely wired
// together at the one place that attaches this server's own Higgsfield
// credentials to an outgoing request: a forged job id must never reach
// fetch at all, and even a job id this server itself validly signed must
// still have its encoded status URL checked against the canonical shape
// before being trusted.
describe('higgsfieldProvider.status (job id signing + canonical URL, wired together)', () => {
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('never calls fetch for a forged job id (no valid signature possible without the server\'s own secret)', async () => {
    vi.resetModules();
    process.env.HF_CREDENTIALS = 'test-key:test-secret';
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const { higgsfieldProvider } = await import('@/lib/ai/higgsfield.server');

    const attackerPayload = {
      provider: 'higgsfield',
      roomId: 'living',
      outputType: 'video',
      styleVariant: 'x',
      prompt: 'p',
      createdAt: Date.now(),
      higgsfieldRequestId: 'x',
      higgsfieldStatusUrl: 'https://attacker.example.com/steal-credentials',
    };
    const forgedPayloadB64 = Buffer.from(JSON.stringify(attackerPayload), 'utf8').toString('base64url');
    const forgedJobId = `${forgedPayloadB64}.totally-guessed-signature`;

    await expect(higgsfieldProvider.status(forgedJobId)).rejects.toThrow(/invalid or corrupted job id/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('uses the encoded status URL as-is when it is genuinely signed AND matches the canonical shape for its own request id', async () => {
    vi.resetModules();
    process.env.HF_CREDENTIALS = 'test-key:test-secret';
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'completed', video: { url: 'https://cdn.example.com/result.mp4' } }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { higgsfieldProvider, canonicalStatusUrl } = await import('@/lib/ai/higgsfield.server');
    const { encodeJobId } = await import('@/lib/ai/jobId');

    const requestId = 'req-legit-123';
    const statusUrl = canonicalStatusUrl(requestId);
    const jobId = encodeJobId({
      provider: 'higgsfield',
      roomId: 'living',
      outputType: 'video',
      styleVariant: 'warm-oak',
      prompt: 'a cozy reading nook',
      createdAt: Date.now(),
      higgsfieldRequestId: requestId,
      higgsfieldStatusUrl: statusUrl,
    });

    const job = await higgsfieldProvider.status(jobId);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(statusUrl);
    expect(job.status).toBe('completed');
    expect(job.resultUrl).toBe('https://cdn.example.com/result.mp4');
  });

  it('ignores an encoded status URL on a trusted host but with the wrong path, and reconstructs the canonical one instead', async () => {
    vi.resetModules();
    process.env.HF_CREDENTIALS = 'test-key:test-secret';
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'queued' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { higgsfieldProvider, canonicalStatusUrl } = await import('@/lib/ai/higgsfield.server');
    const { encodeJobId } = await import('@/lib/ai/jobId');

    const requestId = 'req-legit-456';
    const wrongPathUrl = 'https://platform.higgsfield.ai/some/other/endpoint';
    const jobId = encodeJobId({
      provider: 'higgsfield',
      roomId: 'living',
      outputType: 'video',
      styleVariant: 'warm-oak',
      prompt: 'a cozy reading nook',
      createdAt: Date.now(),
      higgsfieldRequestId: requestId,
      higgsfieldStatusUrl: wrongPathUrl,
    });

    await higgsfieldProvider.status(jobId);

    expect(fetchMock.mock.calls[0][0]).toBe(canonicalStatusUrl(requestId));
    expect(fetchMock.mock.calls[0][0]).not.toBe(wrongPathUrl);
  });

  it('ignores an encoded status URL on an entirely untrusted host, even though it IS genuinely signed by this server, and reconstructs the canonical one instead', async () => {
    // Models the defense-in-depth scenario itself: proves isCanonicalStatusUrl
    // independently enforces the URL shape rather than the signature check
    // alone being what keeps this safe.
    vi.resetModules();
    process.env.HF_CREDENTIALS = 'test-key:test-secret';
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'queued' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { higgsfieldProvider, canonicalStatusUrl } = await import('@/lib/ai/higgsfield.server');
    const { encodeJobId } = await import('@/lib/ai/jobId');

    const requestId = 'req-legit-789';
    const attackerUrl = 'https://attacker.example.com/steal-credentials';
    const jobId = encodeJobId({
      provider: 'higgsfield',
      roomId: 'living',
      outputType: 'video',
      styleVariant: 'warm-oak',
      prompt: 'a cozy reading nook',
      createdAt: Date.now(),
      higgsfieldRequestId: requestId,
      higgsfieldStatusUrl: attackerUrl,
    });

    await higgsfieldProvider.status(jobId);

    expect(fetchMock.mock.calls[0][0]).toBe(canonicalStatusUrl(requestId));
    expect(fetchMock.mock.calls[0][0]).not.toBe(attackerUrl);
  });
});

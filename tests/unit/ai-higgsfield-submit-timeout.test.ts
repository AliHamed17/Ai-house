import { afterEach, describe, expect, it, vi } from 'vitest';

const ORIGINAL_ENV = { ...process.env };

// Regression coverage for a follow-on gap in the OrphanedTimeoutError
// reconciliation mechanism itself (idempotency.server.ts): withTimeout's
// `orphaned` promise is exactly whatever `run` returns, so submit() must do
// its OWN request-id extraction and encodeJobId() work INSIDE the callback
// passed to withTimeout — not after withTimeout resolves — or a late
// reconciliation observes the SDK's raw, unprocessed response instead of a
// real job id string.
describe("higgsfieldProvider.submit (OrphanedTimeoutError reconciles to submit()'s own encoded job id, regression)", () => {
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.doUnmock('@higgsfield/client/v2');
    vi.useRealTimers();
    vi.resetModules();
  });

  it("resolves the orphaned promise to a real, decodable job id — not the SDK's raw HiggsfieldSubscribeResult", async () => {
    vi.resetModules();
    process.env.HF_CREDENTIALS = 'test-key:test-secret';
    process.env.PUBLIC_ASSET_ORIGIN = 'https://example.com';

    let resolveSubscribe!: (value: unknown) => void;
    const subscribeMock = vi.fn().mockReturnValue(
      new Promise((resolve) => {
        resolveSubscribe = resolve;
      }),
    );
    vi.doMock('@higgsfield/client/v2', () => ({
      config: vi.fn(),
      higgsfield: { subscribe: subscribeMock },
    }));

    const { higgsfieldProvider } = await import('@/lib/ai/higgsfield.server');
    const { decodeJobId } = await import('@/lib/ai/jobId');
    const { OrphanedTimeoutError } = await import('@/lib/ai/resilience.server');

    vi.useFakeTimers();
    let caught: unknown;
    const pending = higgsfieldProvider
      .submit({
        provider: 'higgsfield',
        outputType: 'video',
        roomId: 'living',
        styleVariant: 'warm-oak',
        prompt: 'a cozy reading nook',
        sourceAssetPath: '/evidence/frames/00-00-16_open-social-zone.jpg',
      })
      .catch((error: unknown) => {
        caught = error;
      });

    // Drives the 30s deadline inside withTimeout without waiting on it —
    // subscribeMock's own promise is still pending at this point, exactly
    // like the real uncancellable SDK call outliving this app's own wait.
    await vi.runAllTimersAsync();
    await pending;
    vi.useRealTimers();

    expect(caught).toBeInstanceOf(OrphanedTimeoutError);

    // Higgsfield's servers finish (and bill) the job well after this app
    // gave up waiting on it.
    resolveSubscribe({
      jobs: [{ request_id: 'late-request-id', status_url: 'https://platform.higgsfield.ai/requests/late-request-id/status' }],
    });

    const reconciled = await (caught as InstanceType<typeof OrphanedTimeoutError>).orphaned;
    expect(typeof reconciled).toBe('string');
    const payload = decodeJobId(reconciled as string);
    expect(payload.provider).toBe('higgsfield');
    expect(payload.roomId).toBe('living');
    expect(payload.higgsfieldRequestId).toBe('late-request-id');
  });
});

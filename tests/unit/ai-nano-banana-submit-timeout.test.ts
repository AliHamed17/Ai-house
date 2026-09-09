import { afterEach, describe, expect, it, vi } from 'vitest';

const generateContentMock = vi.fn();

vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    models = { generateContent: generateContentMock };
  },
  Modality: { IMAGE: 'IMAGE' },
}));

const ORIGINAL_ENV = { ...process.env };

// Regression coverage for a follow-on gap in the SAME OrphanedTimeoutError
// reconciliation mechanism the Higgsfield fix closed. Unlike Higgsfield's
// uncancellable subscribe(), Gemini's generateContent DOES honor an
// AbortSignal — an earlier round wired the timeout's own signal through to
// it, so aborting on timeout rejected the SAME promise OrphanedTimeoutError's
// `orphaned` carries, permanently destroying any chance to recover a
// timed-out-but-actually-completed (and billed) generation. This proves both
// halves of the fix: the call is never aborted, AND a late resolution still
// reconciles to a real, decodable job id (not the raw SDK response).
describe("nanoBananaProvider.submit (never aborts on timeout, so OrphanedTimeoutError reconciles to a real job id, regression)", () => {
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    generateContentMock.mockReset();
    vi.useRealTimers();
    vi.resetModules();
  });

  it('leaves the underlying generateContent call unaborted on timeout, and a late resolution reconciles to submit()\'s own encoded job id', async () => {
    process.env.GEMINI_API_KEY = 'test-key-not-real';

    let resolveGenerate!: (value: unknown) => void;
    let capturedSignal: AbortSignal | undefined;
    generateContentMock.mockImplementation((args: { config?: { abortSignal?: AbortSignal } }) => {
      capturedSignal = args.config?.abortSignal;
      return new Promise((resolve) => {
        resolveGenerate = resolve;
      });
    });

    vi.resetModules();
    const { nanoBananaProvider } = await import('@/lib/ai/nanoBanana.server');
    const { decodeJobId } = await import('@/lib/ai/jobId');
    const { OrphanedTimeoutError } = await import('@/lib/ai/resilience.server');

    vi.useFakeTimers();
    let caught: unknown;
    const pending = nanoBananaProvider
      .submit({
        provider: 'nano-banana',
        outputType: 'image',
        roomId: 'living',
        styleVariant: 'warm-oak',
        prompt: 'a cozy reading nook',
      })
      .catch((error: unknown) => {
        caught = error;
      });

    await vi.runAllTimersAsync();
    await pending;
    vi.useRealTimers();

    expect(caught).toBeInstanceOf(OrphanedTimeoutError);
    // The whole point of the fix: the SDK call was never told to abort, so
    // it's still pending below rather than having already rejected.
    expect(capturedSignal).toBeUndefined();

    // Google's servers finish (and bill) the generation well after this
    // app's own wait gave up on it.
    resolveGenerate({
      candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: 'aGVsbG8=' } }] } }],
    });

    const reconciled = await (caught as InstanceType<typeof OrphanedTimeoutError>).orphaned;
    expect(typeof reconciled).toBe('string');
    const payload = decodeJobId(reconciled as string);
    expect(payload.provider).toBe('nano-banana');
    expect(payload.roomId).toBe('living');
    expect(payload.nanoBananaResultKey).toBeDefined();
  });
});

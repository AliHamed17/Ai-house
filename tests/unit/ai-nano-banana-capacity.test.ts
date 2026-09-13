import { afterEach, describe, expect, it, vi } from 'vitest';

const generateContentMock = vi.fn();

vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    models = { generateContent: generateContentMock };
  },
  Modality: { IMAGE: 'IMAGE' },
}));

const ORIGINAL_ENV = { ...process.env };

describe('nanoBananaProvider.submit refuses a paid call once the result store is at capacity (regression)', () => {
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    generateContentMock.mockReset();
    vi.resetModules();
  });

  it('rejects with RESULT_STORE_AT_CAPACITY_MESSAGE before calling generateContent, instead of evicting an unpolled result', async () => {
    process.env.GEMINI_API_KEY = 'test-key-not-real';
    vi.resetModules();
    const { nanoBananaProvider } = await import('@/lib/ai/nanoBanana.server');
    const { putStoredResult, RESULT_STORE_AT_CAPACITY_MESSAGE, isResultStoreAtCapacityError } = await import('@/lib/ai/resultStore.server');

    // Fill the store to MAX_ENTRIES with results nothing has polled for yet
    // — exactly the situation a 101st completion used to resolve by
    // silently evicting the oldest of these (see RESULT_STORE_AT_CAPACITY_MESSAGE's
    // own doc comment for why that turned an already-billed job into a
    // permanent, unrecoverable failure for whichever client was still
    // waiting on it).
    const unpolledIds: string[] = [];
    for (let i = 0; i < 100; i++) unpolledIds.push(putStoredResult('image/png', `entry-${i}`));

    await expect(
      nanoBananaProvider.submit({
        provider: 'nano-banana',
        outputType: 'image',
        roomId: 'living',
        styleVariant: 'warm-oak',
        prompt: 'test prompt',
      }),
    ).rejects.toThrow(RESULT_STORE_AT_CAPACITY_MESSAGE);

    // The rejection happened before spending any money...
    expect(generateContentMock).not.toHaveBeenCalled();

    // ...and every one of the 100 still-unpolled results is exactly as it
    // was — none of them paid the price for this refused request.
    const { getStoredResult } = await import('@/lib/ai/resultStore.server');
    for (const id of unpolledIds) expect(getStoredResult(id)).toBeDefined();

    try {
      await nanoBananaProvider.submit({
        provider: 'nano-banana',
        outputType: 'image',
        roomId: 'living',
        styleVariant: 'warm-oak',
        prompt: 'test prompt',
      });
      throw new Error('expected submit() to reject');
    } catch (error) {
      expect(isResultStoreAtCapacityError(error)).toBe(true);
    }
  });

  it('does not let two concurrent submissions both claim the one free slot before either has stored a result (regression)', async () => {
    // A plain read-only size check (the P2 finding this replaced) would let
    // BOTH of these calls observe the same pre-generation store.size and
    // pass, since neither has reached putStoredResult yet when the other's
    // own check runs — reserveResultSlot must claim the slot synchronously,
    // before either submit() call's first await, to close this race.
    process.env.GEMINI_API_KEY = 'test-key-not-real';
    vi.resetModules();
    const { nanoBananaProvider } = await import('@/lib/ai/nanoBanana.server');
    const { putStoredResult, RESULT_STORE_AT_CAPACITY_MESSAGE } = await import('@/lib/ai/resultStore.server');
    generateContentMock.mockResolvedValue({
      candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: 'aGVsbG8=' } }] } }],
    });

    // One slot free: 99 already-stored (unpolled) results.
    for (let i = 0; i < 99; i++) putStoredResult('image/png', `entry-${i}`);

    const input = {
      provider: 'nano-banana' as const,
      outputType: 'image' as const,
      roomId: 'living' as const,
      styleVariant: 'warm-oak',
      prompt: 'test prompt',
    };
    // Issued back-to-back, neither awaited yet — each submit() call runs
    // synchronously through its own reserveResultSlot() before yielding at
    // generateContent's await, so this genuinely exercises both calls'
    // reservation checks racing against each other, not just one after the
    // other's result is already known.
    const first = nanoBananaProvider.submit(input);
    const second = nanoBananaProvider.submit(input);

    const results = await Promise.allSettled([first, second]);
    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0].reason as Error).message).toBe(RESULT_STORE_AT_CAPACITY_MESSAGE);
  });
});

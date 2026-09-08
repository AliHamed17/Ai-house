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
});

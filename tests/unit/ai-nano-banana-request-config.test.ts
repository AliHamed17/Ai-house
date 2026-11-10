import { afterEach, describe, expect, it, vi } from 'vitest';

const generateContentMock = vi.fn();

vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    models = { generateContent: generateContentMock };
  },
  Modality: { IMAGE: 'IMAGE' },
}));

const ORIGINAL_ENV = { ...process.env };

describe('nanoBananaProvider.submit requests IMAGE output (regression)', () => {
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    generateContentMock.mockReset();
    vi.resetModules();
  });

  it('sets responseModalities and imageConfig on the generateContent call, mirroring the offline generator', async () => {
    process.env.GEMINI_API_KEY = 'test-key-not-real';
    generateContentMock.mockResolvedValue({
      candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: 'aGVsbG8=' } }] } }],
    });
    vi.resetModules();
    const { nanoBananaProvider } = await import('@/lib/ai/nanoBanana.server');

    await nanoBananaProvider.submit({
      provider: 'nano-banana',
      outputType: 'image',
      roomId: 'living',
      styleVariant: 'warm-oak',
      prompt: 'test prompt',
    });

    expect(generateContentMock).toHaveBeenCalledTimes(1);
    const callArgs = generateContentMock.mock.calls[0][0];
    // Without this, Gemini can return a text-only response — the paid call
    // still completes and is billed, but the app then reports "no image
    // data" as if generation itself had failed.
    expect(callArgs.config.responseModalities).toEqual(['IMAGE']);
    expect(callArgs.config.imageConfig).toMatchObject({ aspectRatio: '4:3', imageSize: '2K' });
  });
});

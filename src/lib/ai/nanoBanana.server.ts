import 'server-only';
import { GoogleGenAI } from '@google/genai';
import type { GenerationInput, GenerationJob, MediaGenerationProvider } from '@/lib/types';
import { decodeJobId, encodeJobId } from './jobId';
import { readPublicFileAsBase64 } from './publicAsset.server';
import { getGeneratedImage, putGeneratedImage } from './resultStore.server';
import { withTimeout } from './resilience.server';

/**
 * Nano Banana = Google's Gemini native image-generation family.
 * NANO_BANANA_MODEL defaults to the high-fidelity "Pro" model for final
 * geometry-sensitive interior concepts; set it to a faster flash model for
 * quick iterative drafts. Never hardcode the model name anywhere else.
 */
const NANO_BANANA_MODEL = process.env.NANO_BANANA_MODEL || 'gemini-3-pro-image';

function apiKey(): string | undefined {
  return process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
}

function getClient(): GoogleGenAI {
  const key = apiKey();
  if (!key) {
    throw new Error('Set GEMINI_API_KEY (or GOOGLE_API_KEY). Nano Banana generation is unavailable in this environment.');
  }
  return new GoogleGenAI({ apiKey: key });
}

export function isNanoBananaConfigured(): boolean {
  return Boolean(apiKey());
}

/**
 * Gemini image generation is a single synchronous call (no provider-side job
 * queue), so `submit` does the full generation and encodes the finished
 * result into the job id; `status` just decodes and returns it. This keeps
 * the same submit-then-poll shape the UI uses for every provider.
 */
export const nanoBananaProvider: MediaGenerationProvider = {
  id: 'nano-banana',
  async submit(input: GenerationInput) {
    const ai = getClient();

    const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [{ text: input.prompt }];
    if (input.sourceAssetPath) {
      const source = await readPublicFileAsBase64(input.sourceAssetPath);
      if (source) parts.push({ inlineData: { mimeType: source.mimeType, data: source.base64 } });
    }

    const response = await withTimeout(
      ai.models.generateContent({ model: NANO_BANANA_MODEL, contents: parts }),
      45_000,
      'Nano Banana generation timed out after 45s',
    );

    const candidateParts = response.candidates?.[0]?.content?.parts ?? [];
    const imagePart = candidateParts.find((p): p is { inlineData: { mimeType?: string; data?: string } } => Boolean((p as { inlineData?: unknown }).inlineData));
    if (!imagePart?.inlineData?.data) {
      throw new Error('Nano Banana returned no image data for this prompt.');
    }

    const mimeType = imagePart.inlineData.mimeType || 'image/png';
    const resultKey = putGeneratedImage(`data:${mimeType};base64,${imagePart.inlineData.data}`);
    const jobId = encodeJobId({
      provider: 'nano-banana',
      roomId: input.roomId,
      outputType: 'image',
      styleVariant: input.styleVariant,
      prompt: input.prompt,
      createdAt: Date.now(),
      resultKey,
    });
    return { jobId };
  },

  async status(jobId: string): Promise<GenerationJob> {
    const payload = decodeJobId(jobId);
    const resultUrl = payload.resultKey ? getGeneratedImage(payload.resultKey) : undefined;
    const expired = Boolean(payload.resultKey) && !resultUrl;
    return {
      jobId,
      provider: 'nano-banana',
      outputType: 'image',
      roomId: payload.roomId,
      status: expired ? 'failed' : 'completed',
      error: expired ? 'This generated image is no longer available. Please generate it again.' : undefined,
      createdAt: new Date(payload.createdAt).toISOString(),
      updatedAt: new Date().toISOString(),
      resultUrl,
      meta: {
        model: NANO_BANANA_MODEL,
        styleVariant: payload.styleVariant,
        prompt: payload.prompt,
        approved: false,
      },
    };
  },
};

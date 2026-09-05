import 'server-only';
import { randomUUID } from 'node:crypto';
import { GoogleGenAI } from '@google/genai';
import type { GenerationInput, GenerationJob, MediaGenerationProvider } from '@/lib/types';
import { decodeJobId, encodeJobId } from './jobId';
import { readPublicFileAsBase64 } from './publicAsset.server';
import { withTimeout } from './resilience.server';

/**
 * Nano Banana = Google's Gemini native image-generation family.
 * NANO_BANANA_MODEL defaults to the high-fidelity "Pro" model for final
 * geometry-sensitive interior concepts; set it to a faster flash model for
 * quick iterative drafts. Never hardcode the model name anywhere else.
 */
const NANO_BANANA_MODEL = process.env.NANO_BANANA_MODEL || 'gemini-3-pro-image';

function getClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured. Nano Banana generation is unavailable in this environment.');
  }
  return new GoogleGenAI({ apiKey });
}

export function isNanoBananaConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY);
}

/**
 * Nano Banana generates synchronously, so `submit` already holds the finished
 * image. We keep the bytes in a small bounded in-memory store keyed by a short
 * random id (that id — not the image — travels in the job id) so the status
 * poll URL stays short. Like the in-memory rate limiter, this store is
 * per-instance and does not survive a cold start: adequate for this prototype
 * (a poll follows submission within a second on the same instance); a
 * production deployment would use a shared object store or blob storage.
 */
const RESULT_TTL_MS = 10 * 60_000;
const MAX_RESULTS = 100;
const resultStore = new Map<string, { dataUrl: string; createdAt: number }>();

function putResult(dataUrl: string): string {
  const now = Date.now();
  for (const [key, value] of resultStore) {
    if (now - value.createdAt > RESULT_TTL_MS) resultStore.delete(key);
  }
  while (resultStore.size >= MAX_RESULTS) {
    const oldest = resultStore.keys().next().value;
    if (oldest === undefined) break;
    resultStore.delete(oldest);
  }
  const key = randomUUID();
  resultStore.set(key, { dataUrl, createdAt: now });
  return key;
}

function getResult(key: string | undefined): string | undefined {
  if (!key) return undefined;
  const entry = resultStore.get(key);
  if (!entry) return undefined;
  if (Date.now() - entry.createdAt > RESULT_TTL_MS) {
    resultStore.delete(key);
    return undefined;
  }
  return entry.dataUrl;
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
    const resultKey = putResult(`data:${mimeType};base64,${imagePart.inlineData.data}`);
    const jobId = encodeJobId({
      provider: 'nano-banana',
      roomId: input.roomId,
      outputType: 'image',
      styleVariant: input.styleVariant,
      prompt: input.prompt,
      createdAt: Date.now(),
      nanoBananaResultKey: resultKey,
    });
    return { jobId };
  },

  async status(jobId: string): Promise<GenerationJob> {
    const payload = decodeJobId(jobId);
    const resultUrl = getResult(payload.nanoBananaResultKey);
    const job: GenerationJob = {
      jobId,
      provider: 'nano-banana',
      outputType: 'image',
      roomId: payload.roomId,
      status: resultUrl ? 'completed' : 'failed',
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
    if (!resultUrl) {
      job.error = 'This concept has expired from the server cache — please generate it again.';
    }
    return job;
  },
};

import 'server-only';
import { GoogleGenAI, Modality } from '@google/genai';
import type { GenerationInput, GenerationJob, MediaGenerationProvider } from '@/lib/types';
import { decodeJobId, encodeJobId } from './jobId';
import { readPublicFileAsBase64 } from './publicAsset.server';
import {
  getStoredResult,
  putStoredResult,
  releaseResultSlot,
  reserveResultSlot,
  RESULT_STORE_AT_CAPACITY_MESSAGE,
  RESULT_URL_PREFIX,
  resultIdFromPath,
  SOURCE_EXPIRED_MESSAGE,
} from './resultStore.server';
import { withTimeout } from './resilience.server';

/**
 * Nano Banana = Google's Gemini native image-generation family.
 * NANO_BANANA_MODEL defaults to the high-fidelity "Pro" model (Nano Banana
 * Pro) for final geometry-sensitive interior concepts; set it to the faster
 * `gemini-2.5-flash-image` for quick iterative drafts. Never hardcode the
 * model name anywhere else.
 */
const NANO_BANANA_MODEL = process.env.NANO_BANANA_MODEL || 'gemini-3-pro-image-preview';

// The google-genai SDK honors either variable; accept both so a key set as
// GOOGLE_API_KEY (as the Nano Banana skill documents) works too.
function nanoBananaApiKey(): string | undefined {
  return process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
}

function getClient(): GoogleGenAI {
  const apiKey = nanoBananaApiKey();
  if (!apiKey) {
    throw new Error('No Gemini credentials configured (set GEMINI_API_KEY or GOOGLE_API_KEY). Nano Banana generation is unavailable in this environment.');
  }
  return new GoogleGenAI({ apiKey });
}

export function isNanoBananaConfigured(): boolean {
  return Boolean(nanoBananaApiKey());
}

// generateContent is given an AbortSignal (below) so our own client-side wait
// stops on timeout, but that only closes OUR connection — it cannot recall
// generation Google's servers already started (and will bill) once the
// request reached them. A timeout here is therefore exactly as ambiguous as
// Higgsfield's uncancellable subscribe() call (see isSubmitTimeout in
// higgsfield.server.ts): the route must not treat it as a definite failure
// safe to retry, or a retry could start a second, separately billed
// generation for the exact same request. Naming the message here (rather
// than duplicating the literal string in the route) is what lets
// isSubmitTimeout() below match it reliably.
const SUBMIT_TIMEOUT_MESSAGE = 'Nano Banana generation timed out after 45s';

export function isSubmitTimeout(error: unknown): boolean {
  return error instanceof Error && error.message === SUBMIT_TIMEOUT_MESSAGE;
}

/**
 * Reads a source image for an image-to-image generation. Accepts either a
 * public site asset (an evidence frame, a committed concept) or a previously
 * generated result served from the in-memory store — the latter is how an
 * *approved* concept is fed back in as the source for a refinement.
 *
 * The two failure modes are deliberately distinguished rather than both
 * collapsing to null: a stored result that fell out of the TTL cache means
 * the caller's approved concept specifically has expired (SOURCE_EXPIRED_MESSAGE,
 * which the routes turn into a 410 the client acts on by clearing that stale
 * approval); a static asset failing to read is a different problem — there is
 * no earlier concept to "regenerate" in that case — so it keeps a separate
 * message that doesn't imply one.
 */
async function readSourceImage(sourceAssetPath: string): Promise<{ mimeType: string; base64: string }> {
  const storedId = resultIdFromPath(sourceAssetPath);
  if (storedId) {
    const stored = getStoredResult(storedId);
    if (!stored) throw new Error(SOURCE_EXPIRED_MESSAGE);
    return { mimeType: stored.mimeType, base64: stored.base64 };
  }
  const publicFile = await readPublicFileAsBase64(sourceAssetPath);
  if (!publicFile) {
    throw new Error('The source image for this generation could not be loaded. Please try again.');
  }
  return publicFile;
}

/**
 * Gemini image generation is a single synchronous call (no provider-side job
 * queue), so `submit` does the full generation, stores the bytes, and puts
 * only the short store id into the job id; `status` returns a fetchable URL
 * to those bytes. This keeps the same submit-then-poll shape the UI uses for
 * every provider while keeping the (large) image out of the job id / poll URL.
 */
export const nanoBananaProvider: MediaGenerationProvider = {
  id: 'nano-banana',
  async submit(input: GenerationInput) {
    // Claimed synchronously before the paid call below, and released no
    // matter how this generation ends (success or failure) — see
    // reserveResultSlot's own doc comment for why a plain read-only capacity
    // check isn't enough on its own (a check-then-act race across
    // concurrent submissions) and why claiming a slot up front is.
    if (!reserveResultSlot()) {
      throw new Error(RESULT_STORE_AT_CAPACITY_MESSAGE);
    }

    try {
      const ai = getClient();

      const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [{ text: input.prompt }];
      if (input.sourceAssetPath) {
        // readSourceImage throws (rather than returning null) when the source
        // can't be loaded, so a text-only prompt is never silently substituted
        // and paid for in place of the intended image-to-image edit.
        const source = await readSourceImage(input.sourceAssetPath);
        parts.push({ inlineData: { mimeType: source.mimeType, data: source.base64 } });
      }

      const response = await withTimeout(
        (signal) =>
          ai.models.generateContent({
            model: NANO_BANANA_MODEL,
            contents: parts,
            config: {
              abortSignal: signal,
              // Without an explicit IMAGE modality, Gemini can return a
              // text-only response — the paid call still completes and is
              // billed, but the inlineData check below then fails as if
              // generation itself had failed. Mirrors the offline generator
              // (scripts/generate-concepts.py) so both paths behave the same.
              responseModalities: [Modality.IMAGE],
              imageConfig: { aspectRatio: '4:3', imageSize: '2K' },
            },
          }),
        45_000,
        SUBMIT_TIMEOUT_MESSAGE,
      );

      const candidateParts = response.candidates?.[0]?.content?.parts ?? [];
      const imagePart = candidateParts.find((p): p is { inlineData: { mimeType?: string; data?: string } } => Boolean((p as { inlineData?: unknown }).inlineData));
      if (!imagePart?.inlineData?.data) {
        throw new Error('Nano Banana returned no image data for this prompt.');
      }

      const mimeType = imagePart.inlineData.mimeType || 'image/png';
      const resultKey = putStoredResult(mimeType, imagePart.inlineData.data);
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
    } finally {
      releaseResultSlot();
    }
  },

  async status(jobId: string): Promise<GenerationJob> {
    const payload = decodeJobId(jobId);
    const stored = getStoredResult(payload.nanoBananaResultKey);
    const resultUrl = stored ? `${RESULT_URL_PREFIX}${payload.nanoBananaResultKey}` : undefined;
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

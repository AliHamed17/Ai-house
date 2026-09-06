import 'server-only';
import type { GenerationInput, GenerationJob, GenerationStatus, MediaGenerationProvider } from '@/lib/types';
import { decodeJobId, encodeJobId } from './jobId';
import { resultIdFromPath } from './resultStore.server';

const QUEUED_UNTIL_MS = 900;
const IN_PROGRESS_UNTIL_MS = 2600;

/**
 * Deterministic mock provider: no network calls, no credentials. Status is
 * derived purely from elapsed time since the job id's createdAt timestamp,
 * so it works identically across repeated polls and cold starts. The
 * `simulate` field (chosen in the AI Studio's demo-mode UI) lets a visitor
 * intentionally exercise the failure/moderated end states.
 */
export const mockProvider: MediaGenerationProvider = {
  id: 'mock',
  async submit(input: GenerationInput) {
    // Only a genuinely live-generated (stored) source is worth threading
    // through to the mock clip below — a raw evidence frame or the generic
    // concept-placeholder path is what the mock IMAGE flow already shows by
    // default, so reusing those here would replace the nicer placeholder art
    // with a raw photo instead of improving on anything.
    const mockSourceResultPath =
      input.outputType === 'video' && input.sourceAssetPath && resultIdFromPath(input.sourceAssetPath)
        ? input.sourceAssetPath
        : undefined;
    const jobId = encodeJobId({
      provider: 'mock',
      roomId: input.roomId,
      outputType: input.outputType,
      styleVariant: input.styleVariant,
      prompt: input.prompt,
      createdAt: Date.now(),
      simulate: input.simulate ?? 'success',
      mockSourceResultPath,
    });
    return { jobId };
  },

  async status(jobId: string): Promise<GenerationJob> {
    const payload = decodeJobId(jobId);
    const elapsed = Date.now() - payload.createdAt;

    let status: GenerationStatus;
    if (elapsed < QUEUED_UNTIL_MS) status = 'queued';
    else if (elapsed < IN_PROGRESS_UNTIL_MS) status = 'in_progress';
    else if (payload.simulate === 'failure') status = 'failed';
    else if (payload.simulate === 'moderated') status = 'moderated';
    else status = 'completed';

    const job: GenerationJob = {
      jobId,
      provider: 'mock',
      outputType: payload.outputType,
      roomId: payload.roomId,
      status,
      createdAt: new Date(payload.createdAt).toISOString(),
      updatedAt: new Date().toISOString(),
      meta: {
        model: payload.outputType === 'video' ? 'mock-cinematic-v1' : 'mock-nano-banana-v1',
        styleVariant: payload.styleVariant,
        prompt: payload.prompt,
        approved: false,
      },
    };

    if (status === 'completed') {
      job.resultUrl = payload.mockSourceResultPath ?? `/generated/concepts/${payload.roomId}.svg`;
      job.resultWidth = 800;
      job.resultHeight = 600;
    } else if (status === 'failed') {
      job.error = 'Demo mode: simulated provider error (no API credentials configured).';
    } else if (status === 'moderated') {
      job.error = 'Demo mode: simulated moderation hold (no API credentials configured).';
    }

    return job;
  },
};

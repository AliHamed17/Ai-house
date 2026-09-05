import 'server-only';
import type { GenerationInput, GenerationJob, GenerationStatus, MediaGenerationProvider } from '@/lib/types';
import { decodeJobId, encodeJobId } from './jobId';
import { toAbsoluteUrl } from './publicAsset.server';
import { retryOnce, withTimeout } from './resilience.server';

/**
 * Endpoint and model are kept configurable because provider offerings
 * change; the documented default (as of the official SDK README) is the
 * image-to-video "dop" endpoint with the "dop-turbo" model.
 */
const HF_ENDPOINT = process.env.HF_IMAGE2VIDEO_ENDPOINT || '/v1/image2video/dop';
const HF_MODEL = process.env.HF_MODEL || 'dop-turbo';

function getCredentials(): string {
  const combined = process.env.HF_CREDENTIALS;
  if (combined) return combined;
  const key = process.env.HF_API_KEY;
  const secret = process.env.HF_API_SECRET;
  if (key && secret) return `${key}:${secret}`;
  throw new Error('Higgsfield credentials are not configured (set HF_CREDENTIALS, or HF_API_KEY + HF_API_SECRET).');
}

export function isHiggsfieldConfigured(): boolean {
  return Boolean(process.env.HF_CREDENTIALS || (process.env.HF_API_KEY && process.env.HF_API_SECRET));
}

function mapStatus(raw: string | undefined): GenerationStatus {
  switch (raw) {
    case 'queued':
      return 'queued';
    case 'in_progress':
      return 'in_progress';
    case 'completed':
      return 'completed';
    case 'failed':
      return 'failed';
    case 'nsfw':
      return 'moderated';
    default:
      return 'queued';
  }
}

interface HiggsfieldSubscribeResult {
  jobs?: Array<{ id?: string; request_id?: string; requestId?: string; status_url?: string; statusUrl?: string }>;
  request_id?: string;
  status_url?: string;
}

export const higgsfieldProvider: MediaGenerationProvider = {
  id: 'higgsfield',
  async submit(input: GenerationInput) {
    if (!input.sourceAssetPath) {
      throw new Error('Higgsfield image-to-video requires an approved source image.');
    }
    const credentials = getCredentials();
    const { config, higgsfield } = await import('@higgsfield/client/v2');
    config({ credentials });

    const imageUrl = toAbsoluteUrl(input.originUrl, input.sourceAssetPath);
    const jobSet = (await withTimeout(
      higgsfield.subscribe(HF_ENDPOINT, {
        input: {
          model: HF_MODEL,
          prompt: input.prompt,
          input_images: [{ type: 'image_url', image_url: imageUrl }],
        },
        withPolling: false,
      }),
      30_000,
      'Higgsfield submission timed out after 30s',
    )) as unknown as HiggsfieldSubscribeResult;

    const job = jobSet.jobs?.[0];
    const requestId = job?.request_id ?? job?.requestId ?? job?.id ?? jobSet.request_id;
    const statusUrl = job?.status_url ?? job?.statusUrl ?? jobSet.status_url;
    if (!requestId) {
      throw new Error('Higgsfield did not return a request id for this job.');
    }

    const jobId = encodeJobId({
      provider: 'higgsfield',
      roomId: input.roomId,
      outputType: 'video',
      styleVariant: input.styleVariant,
      prompt: input.prompt,
      createdAt: Date.now(),
      higgsfieldRequestId: requestId,
      higgsfieldStatusUrl: statusUrl,
    });
    return { jobId };
  },

  async status(jobId: string): Promise<GenerationJob> {
    const payload = decodeJobId(jobId);
    const credentials = getCredentials();
    const url = payload.higgsfieldStatusUrl || `https://platform.higgsfield.ai/requests/${payload.higgsfieldRequestId}/status`;
    const res = await retryOnce(() =>
      withTimeout(fetch(url, { headers: { Authorization: `Key ${credentials}` } }), 10_000, 'Higgsfield status check timed out'),
    );
    if (!res.ok) {
      throw new Error(`Higgsfield status check failed with HTTP ${res.status}`);
    }
    const data = (await res.json()) as { status?: string; video?: { url?: string } };
    const status = mapStatus(data.status);

    const job: GenerationJob = {
      jobId,
      provider: 'higgsfield',
      outputType: 'video',
      roomId: payload.roomId,
      status,
      createdAt: new Date(payload.createdAt).toISOString(),
      updatedAt: new Date().toISOString(),
      resultUrl: data.video?.url,
      meta: {
        model: HF_MODEL,
        styleVariant: payload.styleVariant,
        prompt: payload.prompt,
        approved: false,
      },
    };
    if (status === 'failed') job.error = 'Higgsfield reported a failed generation.';
    if (status === 'moderated') job.error = 'Higgsfield moderated this generation (content policy).';
    return job;
  },
};

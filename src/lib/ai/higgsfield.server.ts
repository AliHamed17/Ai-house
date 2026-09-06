import 'server-only';
import { BlockList, isIP } from 'node:net';
import type { GenerationInput, GenerationJob, GenerationStatus, MediaGenerationProvider } from '@/lib/types';
import { decodeJobId, encodeJobId } from './jobId';
import { toAbsoluteUrl } from './publicAsset.server';
import { getStoredResult, resultIdFromPath } from './resultStore.server';
import { retryOnce, withTimeout } from './resilience.server';

/**
 * Endpoint and model are kept configurable because provider offerings
 * change; the documented default (as of the official SDK README) is the
 * image-to-video "dop" endpoint with the "dop-turbo" model.
 */
const HF_ENDPOINT = process.env.HF_IMAGE2VIDEO_ENDPOINT || '/v1/image2video/dop';
const HF_MODEL = process.env.HF_MODEL || 'dop-turbo';

// The subscribe client cannot be cancelled, so a submission that times out
// leaves Higgsfield's servers possibly still processing (and billing) a job
// this app never got a request id for — the route's caller must not treat
// that the same as a definite failure safe to retry immediately. Naming the
// exact timeout message here (rather than duplicating the literal string in
// the route) is what lets isSubmitTimeout() below match it reliably.
const SUBMIT_TIMEOUT_MESSAGE = 'Higgsfield submission timed out after 30s';

export function isSubmitTimeout(error: unknown): boolean {
  return error instanceof Error && error.message === SUBMIT_TIMEOUT_MESSAGE;
}

// Job ids are unsigned, so an attacker could forge one carrying an
// arbitrary higgsfieldStatusUrl. status() attaches the server's Higgsfield
// credentials to that request, so the URL MUST be pinned to a Higgsfield
// origin or those credentials would be exfiltrated to an attacker's host.
const TRUSTED_HF_HOSTS = ['higgsfield.ai', 'platform.higgsfield.ai', 'cloud.higgsfield.ai'];

export function isTrustedHiggsfieldUrl(candidate: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'https:') return false;
  const host = parsed.hostname.toLowerCase();
  return TRUSTED_HF_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
}

// input.originUrl comes from the incoming request's own origin (see
// src/app/api/higgsfield/generate/route.ts), which in local dev or an
// unconfigured preview deployment is a localhost/private-network address.
// Higgsfield's remote servers cannot fetch such a URL, so submitting one
// would spend a real, billed job on a source image request that is
// guaranteed to fail. Reject it before the paid call instead of after.
const PRIVATE_HOSTNAME_PATTERNS = [/^localhost$/i, /\.localhost$/i];

// net.BlockList does correct CIDR arithmetic (unlike prefix-matching
// regexes, which are easy to get subtly wrong at range boundaries — e.g.
// 172.16.0.0/12 covers only 172.16-31.x, not all of 172.x) and, checked with
// family 'ipv6', also matches an IPv4-mapped address (e.g. ::ffff:10.0.0.5)
// against the ipv4 subnets below, closing that bypass for free.
const PRIVATE_IP_BLOCKLIST = new BlockList();
PRIVATE_IP_BLOCKLIST.addSubnet('0.0.0.0', 8, 'ipv4');
PRIVATE_IP_BLOCKLIST.addSubnet('127.0.0.0', 8, 'ipv4');
PRIVATE_IP_BLOCKLIST.addSubnet('10.0.0.0', 8, 'ipv4');
PRIVATE_IP_BLOCKLIST.addSubnet('172.16.0.0', 12, 'ipv4');
PRIVATE_IP_BLOCKLIST.addSubnet('192.168.0.0', 16, 'ipv4');
PRIVATE_IP_BLOCKLIST.addSubnet('169.254.0.0', 16, 'ipv4');
PRIVATE_IP_BLOCKLIST.addSubnet('::1', 128, 'ipv6');
PRIVATE_IP_BLOCKLIST.addSubnet('fc00::', 7, 'ipv6'); // unique local (ULA)
PRIVATE_IP_BLOCKLIST.addSubnet('fe80::', 10, 'ipv6'); // link-local

export function isPubliclyReachableOrigin(candidate: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false;
  const host = parsed.hostname.toLowerCase();
  if (PRIVATE_HOSTNAME_PATTERNS.some((pattern) => pattern.test(host))) return false;
  // URL.hostname keeps the brackets on an IPv6 literal (e.g. "[::1]"), but
  // net.isIP/BlockList expect the bare address.
  const bareHost = host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host;
  const ipVersion = isIP(bareHost);
  if (ipVersion === 4) return !PRIVATE_IP_BLOCKLIST.check(bareHost, 'ipv4');
  if (ipVersion === 6) return !PRIVATE_IP_BLOCKLIST.check(bareHost, 'ipv6');
  return true; // not an IP literal — a normal public hostname
}

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

/**
 * When the source is one of our own stored Nano Banana results (as opposed to
 * a static public asset, which never expires), confirm it still exists before
 * spending a paid Higgsfield call on a source that will 404 the moment
 * Higgsfield's servers try to fetch it. A static asset path resolves no
 * stored id and is always considered available.
 */
export function assertSourceStillAvailable(sourceAssetPath: string | undefined): void {
  const storedId = resultIdFromPath(sourceAssetPath ?? '');
  if (storedId && !getStoredResult(storedId)) {
    throw new Error('The approved source image has expired from the server cache. Please regenerate and re-approve it, then try again.');
  }
}

// Higgsfield fetches this URL from ITS OWN servers, so it must be a stable
// origin the deployer actually controls — never derived from the incoming
// request. request.nextUrl.origin reflects the Host header, which a caller
// can spoof on any deployment whose proxy forwards or trusts an arbitrary
// Host; that would point Higgsfield's fetch (and this app's billed credit)
// at a server the attacker controls, even though the source path and the
// public-reachability check both still validate. Live generation is refused
// until a real origin is configured, matching how a missing credential or
// AI_ALLOW_LIVE already fails closed elsewhere in this module.
function getTrustedAssetOrigin(): string {
  const origin = process.env.PUBLIC_ASSET_ORIGIN;
  if (!origin) {
    throw new Error(
      'PUBLIC_ASSET_ORIGIN is not configured. Live Higgsfield generation requires a trusted, deployer-configured public origin to build the source image URL from — see .env.example.',
    );
  }
  return origin;
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
    assertSourceStillAvailable(input.sourceAssetPath);

    // Resolve and validate the fetchable image URL before touching the SDK
    // or credentials at all — fail fast on a config problem rather than
    // after already importing/configuring the real client.
    const imageUrl = toAbsoluteUrl(getTrustedAssetOrigin(), input.sourceAssetPath);
    // Defense in depth against a misconfigured PUBLIC_ASSET_ORIGIN (e.g. a
    // deployer accidentally pointing it at a private/loopback address) —
    // the trusted-origin requirement above is the actual fix for the
    // spoofable-Host-header issue this also used to guard against.
    if (!isPubliclyReachableOrigin(imageUrl)) {
      throw new Error(
        'The configured PUBLIC_ASSET_ORIGIN is not publicly reachable (a localhost or private-network origin), so Higgsfield cannot fetch it. Set it to this deployment\'s real public URL.',
      );
    }

    const credentials = getCredentials();
    const { config, higgsfield } = await import('@higgsfield/client/v2');
    config({ credentials });

    // The subscribe client does not accept an AbortSignal, so the timeout can
    // only reject here (it cannot cancel the in-flight submit) — hence submit()
    // is never auto-retried, so a timed-out request never becomes a second job.
    const jobSet = (await withTimeout(
      () =>
        higgsfield.subscribe(HF_ENDPOINT, {
          input: {
            model: HF_MODEL,
            prompt: input.prompt,
            input_images: [{ type: 'image_url', image_url: imageUrl }],
          },
          withPolling: false,
        }),
      30_000,
      SUBMIT_TIMEOUT_MESSAGE,
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
    // Only follow the encoded status URL when it is verifiably a Higgsfield
    // origin; otherwise reconstruct it from the (path-encoded) request id so
    // the credentialed request can never be pointed at an untrusted host.
    const url =
      payload.higgsfieldStatusUrl && isTrustedHiggsfieldUrl(payload.higgsfieldStatusUrl)
        ? payload.higgsfieldStatusUrl
        : `https://platform.higgsfield.ai/requests/${encodeURIComponent(payload.higgsfieldRequestId ?? '')}/status`;
    const res = await retryOnce(() =>
      withTimeout((signal) => fetch(url, { headers: { Authorization: `Key ${credentials}` }, signal }), 10_000, 'Higgsfield status check timed out'),
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

import 'server-only';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { GenerationOutputType, GenerationProviderId, RoomId } from '@/lib/types';

/**
 * The app never persists generation jobs server-side (so it behaves
 * correctly across stateless/serverless invocations). Instead, every fact
 * needed to answer a later status() call is encoded into the opaque jobId
 * itself. This keeps `/api/generation/status/[id]` a pure function of its
 * input with no database, at the cost of a larger id — acceptable for a
 * prototype; a production deployment would swap this for a real job table.
 */
export interface JobIdPayload {
  provider: GenerationProviderId;
  roomId: RoomId;
  outputType: GenerationOutputType;
  styleVariant: string;
  prompt: string;
  createdAt: number;
  simulate?: 'success' | 'failure' | 'moderated';
  higgsfieldRequestId?: string;
  higgsfieldStatusUrl?: string;
  // A short key into the server-side Nano Banana result store. The generated
  // image bytes are intentionally NOT encoded here: a base64 PNG/JPEG would
  // push the job id (and therefore the /api/generation/status/<id> URL) past
  // browser/proxy request-target limits and 414 the very first poll.
  nanoBananaResultKey?: string;
  resultWidth?: number;
  resultHeight?: number;
  // A mock video job's source, when it was a genuinely live-generated
  // (stored) Nano Banana result — see mockProvider.server.ts — so the demo
  // "clip" visibly animates the actual approved still it claims to, rather
  // than always falling back to the room's generic placeholder concept.
  mockSourceResultPath?: string;
}

// Job ids are handed back to (and later re-submitted by) an unauthenticated
// caller via /api/generation/status/[id], with no server-side record of
// which ids this app actually issued — every fact status() needs is
// encoded directly in the id (see the module comment above). Without a
// signature, ANY caller could construct an arbitrary payload: pick
// provider: 'higgsfield' and any higgsfieldStatusUrl/higgsfieldRequestId,
// and higgsfield.server's status() would attach this server's own
// credentials to a request built from those attacker-chosen fields. Signing
// here — and rejecting anything that fails verification before a payload's
// fields are ever trusted by a provider — closes that off at the one place
// every provider's status() already goes through, rather than requiring
// each provider to separately distrust its own job id's contents.
//
// Falls back to a random secret generated fresh per process start (rather
// than requiring a new configured env var) so this keeps working with zero
// configuration, consistent with every other server-side store in this app
// being documented as per-instance and not surviving a cold start — a job
// id's validity window (a submit-then-poll cycle within one running
// instance) already implies the same lifetime. Set JOB_ID_SIGNING_SECRET
// explicitly for ids that must remain valid across restarts or multiple
// instances.
const SIGNING_SECRET = process.env.JOB_ID_SIGNING_SECRET || randomBytes(32).toString('hex');

function sign(payloadB64: string): string {
  return createHmac('sha256', SIGNING_SECRET).update(payloadB64).digest('base64url');
}

// Constant-time comparison so a mismatched signature can't be brute-forced
// byte-by-byte via response-timing differences. timingSafeEqual itself
// requires equal-length buffers, so a length mismatch (an attacker's
// guessed signature will essentially never happen to be the right length)
// is treated as a definite, immediate mismatch rather than compared at all.
function verify(payloadB64: string, signature: string): boolean {
  const expected = Buffer.from(sign(payloadB64));
  const actual = Buffer.from(signature);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function encodeJobId(payload: JobIdPayload): string {
  const payloadB64 = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  return `${payloadB64}.${sign(payloadB64)}`;
}

export function decodeJobId(jobId: string): JobIdPayload {
  try {
    const dotIndex = jobId.indexOf('.');
    if (dotIndex === -1) throw new Error('missing signature');
    const payloadB64 = jobId.slice(0, dotIndex);
    const signature = jobId.slice(dotIndex + 1);
    if (!verify(payloadB64, signature)) throw new Error('signature mismatch');
    const json = Buffer.from(payloadB64, 'base64url').toString('utf8');
    const payload = JSON.parse(json) as JobIdPayload;
    if (!payload.provider || !payload.roomId || !payload.createdAt) {
      throw new Error('missing required fields');
    }
    return payload;
  } catch {
    throw new Error('Invalid or corrupted job id');
  }
}

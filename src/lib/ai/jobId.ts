import 'server-only';
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

export function encodeJobId(payload: JobIdPayload): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

export function decodeJobId(jobId: string): JobIdPayload {
  try {
    const json = Buffer.from(jobId, 'base64url').toString('utf8');
    const payload = JSON.parse(json) as JobIdPayload;
    if (!payload.provider || !payload.roomId || !payload.createdAt) {
      throw new Error('missing required fields');
    }
    return payload;
  } catch {
    throw new Error('Invalid or corrupted job id');
  }
}

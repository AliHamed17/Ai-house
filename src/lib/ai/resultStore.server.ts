import 'server-only';
import { randomUUID } from 'node:crypto';

/**
 * A small bounded, in-memory store for generated image bytes. The generated
 * image never travels inside the job id (a base64 PNG would overflow the
 * status URL); instead the bytes live here under a short random id, and the
 * client fetches them from /api/generation/result/<id>. That URL is also what
 * a follow-up refinement or a Higgsfield animation uses as its source, so an
 * approved concept can actually be handed to the next generation.
 *
 * Like the in-memory rate limiter, this is per-instance and does not survive a
 * cold start — adequate for this prototype (a poll follows submission within a
 * second on the same instance); production would use a shared object/blob store.
 */
interface StoredResult {
  mimeType: string;
  base64: string;
  createdAt: number;
}

const TTL_MS = 10 * 60_000;
const MAX_ENTRIES = 100;
const store = new Map<string, StoredResult>();

export function putStoredResult(mimeType: string, base64: string): string {
  const now = Date.now();
  for (const [key, value] of store) {
    if (now - value.createdAt > TTL_MS) store.delete(key);
  }
  while (store.size >= MAX_ENTRIES) {
    const oldest = store.keys().next().value;
    if (oldest === undefined) break;
    store.delete(oldest);
  }
  const id = randomUUID();
  store.set(id, { mimeType, base64, createdAt: now });
  return id;
}

export function getStoredResult(id: string | undefined): StoredResult | undefined {
  if (!id) return undefined;
  const entry = store.get(id);
  if (!entry) return undefined;
  if (Date.now() - entry.createdAt > TTL_MS) {
    store.delete(id);
    return undefined;
  }
  return entry;
}

/**
 * Like getStoredResult, but also refreshes the entry's TTL clock when found.
 * A plain existence check at preflight time isn't enough for a source about
 * to be handed to a real, slower external step (Higgsfield fetching the URL
 * itself, on its own schedule) — a source that had only seconds left could
 * pass the preflight check and still expire before that fetch happens,
 * wasting a paid job on a 404. Touching it gives it a fresh, full TTL_MS
 * from this exact moment, which comfortably outlasts any realistic
 * provider fetch time.
 *
 * Deletes and re-sets the entry (rather than mutating createdAt in place) so
 * it also moves to the end of the Map's iteration order. putStoredResult's
 * capacity eviction below walks that same order and removes whatever is
 * first — a mutate-in-place touch leaves a just-refreshed entry sitting
 * exactly where it was, so a concurrent unrelated submission that fills the
 * store to capacity would evict it immediately despite the fresh TTL,
 * letting an already-started billed job 404 the moment it fetches the URL.
 */
export function touchStoredResult(id: string | undefined): boolean {
  if (!id) return false;
  const entry = store.get(id);
  if (!entry) return false;
  if (Date.now() - entry.createdAt > TTL_MS) {
    store.delete(id);
    return false;
  }
  store.delete(id);
  store.set(id, { ...entry, createdAt: Date.now() });
  return true;
}

/** Matches the public URL the client and provider adapters use to fetch a stored result. */
export const RESULT_URL_PREFIX = '/api/generation/result/';

/**
 * Extracts the stored-result id from a `/api/generation/result/<id>` path —
 * but only when that path IS the canonical URL for that id (an optional
 * `?query` or `#fragment` suffix is tolerated; a trailing PATH segment is
 * not). A caller-controlled sourceAssetPath is later joined as-is with the
 * trusted asset origin and handed to a provider to fetch (see
 * higgsfield.server's toAbsoluteUrl call) — if a noncanonical path like
 * `<prefix><id>/missing` were accepted here just because an id could be
 * *found* in it, every validation gate that checks "is this a real stored
 * result?" would pass for the extracted id, while the actual URL fetched
 * still 404s, wasting a paid job. Rejecting it here (rather than validating
 * separately at each call site) closes that gap once for every caller.
 */
export function resultIdFromPath(path: string): string | undefined {
  if (!path.startsWith(RESULT_URL_PREFIX)) return undefined;
  const rest = path.slice(RESULT_URL_PREFIX.length);
  const suffixIndex = rest.search(/[?#]/);
  const id = suffixIndex === -1 ? rest : rest.slice(0, suffixIndex);
  if (!id || id.includes('/')) return undefined;
  return id;
}

/**
 * Shared between both provider adapters so the generate routes (and, in
 * turn, the client) can recognize this specific failure and react to it —
 * an approved concept whose stored bytes fell out of this TTL-bounded cache
 * before it was used as the source for a refinement or a cinematic clip.
 * Distinct from a static evidence-frame asset failing to read, which is a
 * different problem with nothing to "regenerate."
 */
export const SOURCE_EXPIRED_MESSAGE =
  'The approved source image has expired from the server cache. Please regenerate and re-approve it, then try again.';

export function isSourceExpiredError(error: unknown): boolean {
  return error instanceof Error && error.message === SOURCE_EXPIRED_MESSAGE;
}

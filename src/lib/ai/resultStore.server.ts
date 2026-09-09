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
 * second on the same instance) but NOT for a multi-instance/serverless
 * deployment: a status/result request landing on a different instance than
 * the one that generated (and, in live mode, already billed for) the result
 * sees a false "expired" 404, and a follow-up refinement or Higgsfield clip
 * can lose its source image. See "Known prototype limitations" in README.md;
 * production would use a shared object/blob store instead.
 */
interface StoredResult {
  mimeType: string;
  base64: string;
  createdAt: number;
}

const TTL_MS = 10 * 60_000;
const MAX_ENTRIES = 100;
const store = new Map<string, StoredResult>();
// Slots claimed by a generation that is currently paying for a result but
// hasn't stored it yet (see reserveResultSlot). Counted alongside store.size
// so concurrent in-flight generations can never collectively overshoot
// MAX_ENTRIES just because none of them has called putStoredResult yet.
let reservedSlots = 0;

function prune(): void {
  const now = Date.now();
  for (const [key, value] of store) {
    if (now - value.createdAt > TTL_MS) store.delete(key);
  }
}

/**
 * Synchronously checks AND claims one slot in a single step — a caller about
 * to start a paid, billed generation must call this FIRST (see
 * isSubmitTimeout's sibling reasoning in nanoBanana.server.ts) and refuse
 * the request if it returns false, then call releaseResultSlot exactly once
 * — on ANY outcome, success or failure — once it's done. A plain read-only
 * size check (store.size >= MAX_ENTRIES) is NOT enough on its own: every one
 * of N concurrent submissions arriving before any of them finishes would
 * observe the SAME pre-generation size and all pass, since nothing is
 * claimed between the check and the eventual putStoredResult call — a
 * classic check-then-act race (the P2 finding this replaced: 101 concurrent
 * requests against an empty store could all start paid work at once). This
 * function has no `await` between its read and its write, so — Node being
 * single-threaded for synchronous code — no other call can observe a
 * half-updated state in between, making the claim genuinely atomic.
 */
export function reserveResultSlot(): boolean {
  prune();
  if (store.size + reservedSlots >= MAX_ENTRIES) return false;
  reservedSlots++;
  return true;
}

/** Releases a slot claimed by reserveResultSlot. Must be called exactly once per successful reservation, regardless of outcome. */
export function releaseResultSlot(): void {
  reservedSlots = Math.max(0, reservedSlots - 1);
}

export const RESULT_STORE_AT_CAPACITY_MESSAGE = 'Too many generated images are cached right now. Please try again in a moment.';

export function isResultStoreAtCapacityError(error: unknown): boolean {
  return error instanceof Error && error.message === RESULT_STORE_AT_CAPACITY_MESSAGE;
}

/** Test-only: resets the module-level store so capacity tests start from zero. */
export function _clearStoreForTests(): void {
  store.clear();
  reservedSlots = 0;
}

/**
 * Stores a just-generated (already billed) result. Never refuses and never
 * evicts an unexpired entry to make room — by the time a result reaches
 * here the provider call has already completed and been paid for, so
 * discarding another, still-unpolled entry to fit it would only turn that
 * OTHER entry's client-side poll into a false "expired" failure instead (see
 * the P2 finding this replaced: a 101st completion evicting an unpolled
 * 1st). reserveResultSlot above is what keeps the store bounded in the
 * ordinary case, by claiming capacity before a paid call even starts.
 */
export function putStoredResult(mimeType: string, base64: string): string {
  prune();
  const id = randomUUID();
  store.set(id, { mimeType, base64, createdAt: Date.now() });
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
 */
export function touchStoredResult(id: string | undefined): boolean {
  if (!id) return false;
  const entry = store.get(id);
  if (!entry) return false;
  if (Date.now() - entry.createdAt > TTL_MS) {
    store.delete(id);
    return false;
  }
  entry.createdAt = Date.now();
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

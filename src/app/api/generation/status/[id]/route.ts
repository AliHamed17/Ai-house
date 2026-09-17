import { NextResponse, type NextRequest } from 'next/server';
import { decodeJobId } from '@/lib/ai/jobId';
import { resolveProviderById } from '@/lib/ai/registry.server';
import { checkRateLimit, STATUS_MAX_REQUESTS_PER_WINDOW } from '@/lib/ai/rateLimit.server';
import { cacheTerminalStatus, getCachedTerminalStatus } from '@/lib/ai/statusCache.server';
import { safeErrorSummary } from '@/lib/ai/errorLogging.server';

export const dynamic = 'force-dynamic';

// Bounds how long any job id, however validly signed, can keep spending
// real credentialed provider lookups — independent of statusCache's own
// eviction. That cache is bounded to MAX_ENTRIES purely for memory, not for
// quota protection: once more than MAX_ENTRIES distinct terminal jobs have
// ever been observed by this process, its FIFO eviction can force even an
// old, otherwise-permanently-cacheable (non-ephemeral) job to fall through
// to a fresh provider call on its very next poll (regression: a holder who
// accumulates and cycles through enough valid ids can keep doing this
// indefinitely, thrashing the cache so every request misses it, bypassing
// the cache's own intended lifetime bound). Refusing to ever call the
// provider again once a job is this old closes that off regardless of the
// cache's own internal state. Matches AIStudioPanel's own
// RECOVERY_MAX_AGE_MS.job (24h) — the client itself gives up trying to
// recover a job this old, so no legitimate caller still needs a fresh look
// at it.
const JOB_LIFETIME_MS = 24 * 60 * 60_000;

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // Decode (and therefore verify the signature — see jobId.ts) BEFORE
  // allocating any rate-limit state. checkRateLimit's own sweep walks its
  // ENTIRE map on every call (see rateLimit.server.ts), so keying it by an
  // unvalidated id would let an unauthenticated caller flood distinct
  // GARBAGE ids to grow that map without bound, turning every subsequent
  // request's sweep into ever-more work — a quadratic-cost DoS that needs
  // no valid job id at all. Decoding first means only a genuinely-signed id
  // (which nothing but this server could have produced) ever creates an
  // entry.
  let payload;
  try {
    payload = decodeJobId(id);
  } catch {
    return NextResponse.json({ error: 'Unknown or invalid job id.' }, { status: 404 });
  }

  // A cached TERMINAL status for this exact job id (see statusCache.server's
  // own doc comment) is served straight away, before the rate limiter and
  // without ever touching the provider — a completed/failed/moderated job
  // never changes again, so replaying the same id can never observe
  // anything new. Serving a cache HIT never costs a real provider call
  // regardless of the job's own age, so this is never gated by
  // JOB_LIFETIME_MS below — only the fallback path that would actually
  // spend one is.
  const cached = getCachedTerminalStatus(id);
  if (cached) {
    return NextResponse.json(cached);
  }

  if (Date.now() - payload.createdAt > JOB_LIFETIME_MS) {
    return NextResponse.json({ error: 'This job is too old to check on any further.' }, { status: 410 });
  }

  // Signing already stops a FORGED id from reaching a provider, but says
  // nothing about how many times a genuinely-issued one can be replayed —
  // every request here spends a real, credentialed provider lookup, so a
  // holder of any one valid id could otherwise exhaust the provider
  // account's own quota with unlimited requests. Keyed by the job id itself
  // (not the caller), so this bounds repeated checks of any ONE job without
  // limiting how many DIFFERENT jobs get polled at once — legitimate
  // simultaneous jobs (e.g. multiple tabs) never compete with each other
  // for budget.
  const rateLimit = checkRateLimit(`status:${id}`, STATUS_MAX_REQUESTS_PER_WINDOW);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Too many status checks for this job. Please wait a moment and try again.' },
      { status: 429, headers: { 'Retry-After': String(Math.ceil(rateLimit.retryAfterMs / 1000)) } },
    );
  }

  const provider = resolveProviderById(payload.provider);
  try {
    const job = await provider.status(id);
    cacheTerminalStatus(id, job);
    return NextResponse.json(job);
  } catch (error) {
    console.error('[generation/status] lookup failed:', safeErrorSummary(error));
    return NextResponse.json({ error: 'Could not fetch generation status.' }, { status: 502 });
  }
}

import { NextResponse, type NextRequest } from 'next/server';
import { decodeJobId } from '@/lib/ai/jobId';
import { resolveProviderById } from '@/lib/ai/registry.server';
import { checkRateLimit, STATUS_MAX_REQUESTS_PER_WINDOW } from '@/lib/ai/rateLimit.server';
import { cacheTerminalStatus, getCachedTerminalStatus } from '@/lib/ai/statusCache.server';
import { safeErrorSummary } from '@/lib/ai/errorLogging.server';

export const dynamic = 'force-dynamic';

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
  let providerId;
  try {
    providerId = decodeJobId(id).provider;
  } catch {
    return NextResponse.json({ error: 'Unknown or invalid job id.' }, { status: 404 });
  }

  // A cached TERMINAL status for this exact job id (see statusCache.server's
  // own doc comment) is served straight away, before the rate limiter and
  // without ever touching the provider — a completed/failed/moderated job
  // never changes again, so replaying the same id can never observe
  // anything new. This is what actually bounds a job's total lifetime of
  // real provider lookups; the per-job rate limit below only bounds their
  // RATE, and its window resets forever, so on its own it never stops a
  // holder of one legitimately issued (but long-finished) job id from
  // eventually exhausting the provider account's own API quota.
  const cached = getCachedTerminalStatus(id);
  if (cached) {
    return NextResponse.json(cached);
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

  const provider = resolveProviderById(providerId);
  try {
    const job = await provider.status(id);
    cacheTerminalStatus(id, job);
    return NextResponse.json(job);
  } catch (error) {
    console.error('[generation/status] lookup failed:', safeErrorSummary(error));
    return NextResponse.json({ error: 'Could not fetch generation status.' }, { status: 502 });
  }
}

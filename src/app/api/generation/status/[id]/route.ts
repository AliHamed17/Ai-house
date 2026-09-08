import { NextResponse, type NextRequest } from 'next/server';
import { decodeJobId } from '@/lib/ai/jobId';
import { resolveProviderById } from '@/lib/ai/registry.server';
import { checkRateLimit, STATUS_MAX_REQUESTS_PER_WINDOW } from '@/lib/ai/rateLimit.server';

export const dynamic = 'force-dynamic';

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // Signing (see jobId.ts) already stops a FORGED id from reaching a
  // provider, but says nothing about how many times a genuinely-issued one
  // can be replayed — every request here spends a real, credentialed
  // provider lookup, so a holder of any one valid id could otherwise exhaust
  // the provider account's own quota with unlimited requests. Keyed by the
  // job id itself (not the caller), so this bounds repeated checks of any
  // ONE job without limiting how many DIFFERENT jobs get polled at once —
  // legitimate simultaneous jobs (e.g. multiple tabs) never compete with
  // each other for budget.
  const rateLimit = checkRateLimit(`status:${id}`, STATUS_MAX_REQUESTS_PER_WINDOW);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Too many status checks for this job. Please wait a moment and try again.' },
      { status: 429, headers: { 'Retry-After': String(Math.ceil(rateLimit.retryAfterMs / 1000)) } },
    );
  }

  let providerId;
  try {
    providerId = decodeJobId(id).provider;
  } catch {
    return NextResponse.json({ error: 'Unknown or invalid job id.' }, { status: 404 });
  }

  const provider = resolveProviderById(providerId);
  try {
    const job = await provider.status(id);
    return NextResponse.json(job);
  } catch (error) {
    console.error('[generation/status] lookup failed:', error);
    return NextResponse.json({ error: 'Could not fetch generation status.' }, { status: 502 });
  }
}

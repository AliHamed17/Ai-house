import { NextResponse, type NextRequest } from 'next/server';
import { decodeJobId } from '@/lib/ai/jobId';
import { resolveProviderById } from '@/lib/ai/registry.server';

export const dynamic = 'force-dynamic';

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

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

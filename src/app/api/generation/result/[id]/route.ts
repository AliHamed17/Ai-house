import { NextResponse, type NextRequest } from 'next/server';
import { getStoredResult } from '@/lib/ai/resultStore.server';

export const dynamic = 'force-dynamic';

/**
 * Serves the bytes of a generated image kept in the in-memory result store, so
 * the (potentially large) image never has to travel inside a job id / status
 * URL. The id is an unguessable random UUID minted at generation time. Cached
 * only privately and briefly, matching the store's short TTL.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const stored = getStoredResult(id);
  if (!stored) {
    return NextResponse.json({ error: 'Result not found or expired.' }, { status: 404 });
  }
  const bytes = Buffer.from(stored.base64, 'base64');
  return new NextResponse(bytes, {
    status: 200,
    headers: {
      'Content-Type': stored.mimeType,
      'Content-Length': String(bytes.length),
      'Cache-Control': 'private, max-age=600',
    },
  });
}

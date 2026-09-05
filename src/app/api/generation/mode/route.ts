import { NextResponse } from 'next/server';
import { providerLiveActive } from '@/lib/ai/registry.server';

export const dynamic = 'force-dynamic';

/**
 * Lets the client know, before it ever submits a generation request, whether
 * each provider is live (billed, real credentials AND live generation
 * enabled) or will fall back to the free deterministic mock — so the UI can
 * require explicit confirmation before triggering a real paid job instead of
 * only discovering the mode after the first submission.
 */
export async function GET() {
  return NextResponse.json({
    nanoBanana: providerLiveActive('nano-banana'),
    higgsfield: providerLiveActive('higgsfield'),
  });
}

import { NextResponse, type NextRequest } from 'next/server';
import { resolveProviderForSubmit } from '@/lib/ai/registry.server';
import { validateGenerationRequest } from '@/lib/ai/validateGenerationInput.server';
import { checkRateLimit, clientKeyFromRequest } from '@/lib/ai/rateLimit.server';
import { buildNanoBananaEditPrompt, buildNanoBananaPrompt } from '@/data/roomPrompts';
import { resultIdFromPath } from '@/lib/ai/resultStore.server';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const rateLimit = checkRateLimit(`nano-banana:${clientKeyFromRequest(request)}`);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Too many generation requests. Please wait a moment and try again.' },
      { status: 429, headers: { 'Retry-After': String(Math.ceil(rateLimit.retryAfterMs / 1000)) } },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Request body must be valid JSON.' }, { status: 400 });
  }

  const validated = validateGenerationRequest(body);
  if (!validated.ok) {
    return NextResponse.json({ error: validated.error }, { status: 400 });
  }

  const { provider, demoMode } = resolveProviderForSubmit('nano-banana');
  // The edit-prompt framing ("refine this approved concept") only makes sense
  // when the source is actually a prior generated-and-approved result — never
  // the raw unfinished evidence frame. Check that server-side (a stored-result
  // path), not the client's word, so a stray edit instruction on a first-ever
  // generation still gets the full furnishing/material brief instead of a
  // paid "edit" of an empty room with no furnishing instructions at all.
  const hasApprovedSource = Boolean(validated.data.sourceAssetPath && resultIdFromPath(validated.data.sourceAssetPath));
  const prompt =
    validated.data.editInstruction && hasApprovedSource
      ? buildNanoBananaEditPrompt(validated.data.roomId, validated.data.editInstruction)
      : buildNanoBananaPrompt(validated.data.roomId, validated.data.styleVariant, validated.data.editInstruction);

  try {
    const { jobId } = await provider.submit({
      provider: 'nano-banana',
      outputType: 'image',
      roomId: validated.data.roomId,
      styleVariant: validated.data.styleVariant,
      sourceAssetPath: validated.data.sourceAssetPath,
      prompt,
      simulate: validated.data.simulate,
      originUrl: request.nextUrl.origin,
    });
    return NextResponse.json({ jobId, demoMode, provider: demoMode ? 'mock' : 'nano-banana' });
  } catch (error) {
    console.error('[nano-banana/generate] submission failed:', error);
    return NextResponse.json({ error: 'Generation could not be started. Please try again.' }, { status: 502 });
  }
}

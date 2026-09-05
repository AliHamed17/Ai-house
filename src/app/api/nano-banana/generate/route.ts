import { NextResponse, type NextRequest } from 'next/server';
import { resolveProviderForSubmit } from '@/lib/ai/registry.server';
import { validateGenerationRequest } from '@/lib/ai/validateGenerationInput.server';
import { checkRateLimit, clientKeyFromRequest } from '@/lib/ai/rateLimit.server';
import { buildNanoBananaEditPrompt, buildNanoBananaPrompt } from '@/data/roomPrompts';

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
  const prompt = validated.data.editInstruction
    ? buildNanoBananaEditPrompt(validated.data.roomId, validated.data.editInstruction)
    : buildNanoBananaPrompt(validated.data.roomId, validated.data.styleVariant);

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

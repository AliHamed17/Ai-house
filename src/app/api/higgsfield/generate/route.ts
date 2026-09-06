import { NextResponse, type NextRequest } from 'next/server';
import { resolveProviderForSubmit } from '@/lib/ai/registry.server';
import { validateGenerationRequest } from '@/lib/ai/validateGenerationInput.server';
import { checkRateLimit, clientKeyFromRequest } from '@/lib/ai/rateLimit.server';
import { resultIdFromPath } from '@/lib/ai/resultStore.server';
import { isSubmitTimeout } from '@/lib/ai/higgsfield.server';
import { buildHiggsfieldPrompt } from '@/data/roomPrompts';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const rateLimit = checkRateLimit(`higgsfield:${clientKeyFromRequest(request)}`);
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
  if (!validated.data.sourceAssetPath) {
    return NextResponse.json({ error: 'A sourceAssetPath (an approved room concept image) is required for image-to-video.' }, { status: 400 });
  }

  const { provider, demoMode } = resolveProviderForSubmit('higgsfield');

  // The client only shows a "must approve a real image first" gate as a UX
  // nicety — this route is directly reachable, so that check alone can't stop
  // a caller from submitting any nonempty site-relative path (a static
  // evidence frame or placeholder concept SVG) straight to a real, billed
  // job. A live submission must name a genuine stored Nano Banana result;
  // demo mode has no such requirement, since animating a static concept still
  // is the whole point of the mock provider's demo experience.
  if (!demoMode && !resultIdFromPath(validated.data.sourceAssetPath)) {
    return NextResponse.json(
      { error: 'A live cinematic clip requires an approved, previously generated concept image as its source.' },
      { status: 400 },
    );
  }

  const prompt = buildHiggsfieldPrompt(validated.data.roomId);

  try {
    const { jobId } = await provider.submit({
      provider: 'higgsfield',
      outputType: 'video',
      roomId: validated.data.roomId,
      styleVariant: validated.data.styleVariant,
      sourceAssetPath: validated.data.sourceAssetPath,
      prompt,
      simulate: validated.data.simulate,
    });
    return NextResponse.json({ jobId, demoMode, provider: demoMode ? 'mock' : 'higgsfield' });
  } catch (error) {
    console.error('[higgsfield/generate] submission failed:', error);
    // The Higgsfield SDK call cannot be cancelled once in flight, so a
    // timeout here does NOT mean the submission definitely failed — it may
    // still be accepted and running (and billed) server-side with no
    // request id ever reaching us to check on it. Telling the caller this
    // was a definite failure would invite an immediate retry that risks a
    // duplicate charge; a distinct, honest response is the most this
    // architecture can do without provider-side idempotency support.
    if (isSubmitTimeout(error)) {
      return NextResponse.json(
        {
          error:
            'The request to Higgsfield timed out. It may have already been accepted and could still be running (and billed) — please wait a minute and check before submitting again, to avoid a possible duplicate charge.',
        },
        { status: 504 },
      );
    }
    return NextResponse.json({ error: 'Generation could not be started. Please try again.' }, { status: 502 });
  }
}

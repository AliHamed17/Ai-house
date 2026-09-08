import { NextResponse, type NextRequest } from 'next/server';
import { LIVE_RUN_NOT_CONFIRMED_MESSAGE, resolveProviderForSubmit } from '@/lib/ai/registry.server';
import { validateGenerationRequest } from '@/lib/ai/validateGenerationInput.server';
import { checkRateLimit, clientKeyFromRequest } from '@/lib/ai/rateLimit.server';
import { isSourceExpiredError, resultIdFromPath } from '@/lib/ai/resultStore.server';
import { isSubmitTimeout } from '@/lib/ai/higgsfield.server';
import { isIdempotencyKeyMismatchError, reserveIdempotentSubmission } from '@/lib/ai/idempotency.server';
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

  if (!demoMode && !validated.data.liveRunConfirmed) {
    return NextResponse.json({ error: LIVE_RUN_NOT_CONFIRMED_MESSAGE }, { status: 428 });
  }

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
    // Reserved before the provider call is awaited (see idempotency.server),
    // so a retry carrying the same idempotencyKey — even one that arrives
    // while this exact submission is still in flight — joins this call
    // instead of starting a second, separately billed one. isAmbiguousFailure
    // keeps that reservation even if the call rejects with isSubmitTimeout:
    // that specific failure means we don't know whether Higgsfield actually
    // accepted the job, so a retry must not be allowed to start a genuinely
    // second submission — it should keep reconciling to this same outcome.
    // Binds the key to this exact request (see idempotency.server) so a
    // reused/guessed key naming a different room, source, or style never
    // gets handed back a mismatched job.
    const fingerprint = JSON.stringify({
      provider: 'higgsfield',
      roomId: validated.data.roomId,
      styleVariant: validated.data.styleVariant,
      sourceAssetPath: validated.data.sourceAssetPath,
      simulate: validated.data.simulate,
    });
    const jobId = await reserveIdempotentSubmission(
      validated.data.idempotencyKey,
      fingerprint,
      async () => {
        const result = await provider.submit({
          provider: 'higgsfield',
          outputType: 'video',
          roomId: validated.data.roomId,
          styleVariant: validated.data.styleVariant,
          sourceAssetPath: validated.data.sourceAssetPath,
          prompt,
          simulate: validated.data.simulate,
        });
        return result.jobId;
      },
      { isAmbiguousFailure: isSubmitTimeout },
    );
    return NextResponse.json({ jobId, demoMode, provider: demoMode ? 'mock' : 'higgsfield' });
  } catch (error) {
    console.error('[higgsfield/generate] submission failed:', error);
    if (isIdempotencyKeyMismatchError(error)) {
      return NextResponse.json({ error: (error as Error).message }, { status: 409 });
    }
    // This is a definite, pre-billing failure — assertSourceStillAvailable
    // rejects it before the request ever reaches Higgsfield's servers — so,
    // unlike isSubmitTimeout below, there is nothing ambiguous to preserve.
    // A distinct status (rather than the generic 502) is what lets the
    // client recognize it and clear the stale approved source, instead of
    // retrying the exact same request and failing the same way forever.
    if (isSourceExpiredError(error)) {
      return NextResponse.json({ error: (error as Error).message }, { status: 410 });
    }
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

import { NextResponse, type NextRequest } from 'next/server';
import { LIVE_RUN_NOT_CONFIRMED_MESSAGE, resolveProviderForSubmit } from '@/lib/ai/registry.server';
import { hasStableJobIdSigningSecret, JOB_ID_SIGNING_SECRET_REQUIRED_MESSAGE } from '@/lib/ai/jobId';
import { validateGenerationRequest } from '@/lib/ai/validateGenerationInput.server';
import { checkRateLimit, clientKeyFromRequest } from '@/lib/ai/rateLimit.server';
import { buildNanoBananaEditPrompt, buildNanoBananaPrompt } from '@/data/roomPrompts';
import {
  assertPublicSourceRoom,
  assertStoredResultRoom,
  isSourceExpiredError,
  isSourceRoomMismatchError,
  resultIdFromPath,
} from '@/lib/ai/resultStore.server';
import { isSubmitTimeout } from '@/lib/ai/nanoBanana.server';
import { isIdempotencyKeyMismatchError, reserveIdempotentSubmission } from '@/lib/ai/idempotency.server';
import { safeErrorSummary } from '@/lib/ai/errorLogging.server';

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

  if (!demoMode && !hasStableJobIdSigningSecret()) {
    return NextResponse.json({ error: JOB_ID_SIGNING_SECRET_REQUIRED_MESSAGE }, { status: 500 });
  }

  if (!demoMode && !validated.data.liveRunConfirmed) {
    return NextResponse.json({ error: LIVE_RUN_NOT_CONFIRMED_MESSAGE }, { status: 428 });
  }

  // The edit-prompt framing ("refine this approved concept") only makes sense
  // when the source is actually a prior generated-and-approved result — never
  // the raw unfinished evidence frame. Check that server-side (a stored-result
  // path), not the client's word, so a stray edit instruction on a first-ever
  // generation still gets the full furnishing/material brief instead of a
  // paid "edit" of an empty room with no furnishing instructions at all.
  const approvedSourceId = validated.data.sourceAssetPath
    ? resultIdFromPath(validated.data.sourceAssetPath)
    : undefined;

  // Same binding the Higgsfield route enforces: a stored id proves the source
  // is one of ours, but says nothing about WHICH room it was generated for.
  // Without this a refinement could load another room's bytes, preserve that
  // room's architecture, and then store and sign the result under the
  // REQUESTED room — manufacturing a falsely room-tagged source that later
  // billed jobs would treat as authoritative.
  //
  // A public path resolves to no stored id, so the check above skips it
  // entirely — which left the same hole open through the other door: a direct
  // request naming roomId "mamad" alongside another room's evidence frame
  // would generate from those bytes and then store and sign the result as
  // MAMAD. assertPublicSourceRoom closes that by requiring a non-stored
  // source to be the requested room's own evidence frame.
  try {
    assertStoredResultRoom(approvedSourceId, validated.data.roomId);
    assertPublicSourceRoom(validated.data.sourceAssetPath, validated.data.roomId);
  } catch (error) {
    if (isSourceRoomMismatchError(error)) {
      return NextResponse.json({ error: (error as Error).message }, { status: 400 });
    }
    throw error;
  }

  const hasApprovedSource = Boolean(approvedSourceId);
  const prompt =
    validated.data.editInstruction && hasApprovedSource
      ? buildNanoBananaEditPrompt(validated.data.roomId, validated.data.editInstruction)
      : buildNanoBananaPrompt(validated.data.roomId, validated.data.styleVariant, validated.data.editInstruction);

  try {
    // Reserved before the provider call is awaited (see idempotency.server),
    // so a retry carrying the same idempotencyKey — even one that arrives
    // while this exact submission is still in flight — joins this call
    // instead of starting a second, separately billed one. isAmbiguousFailure
    // keeps that reservation even if the call rejects with isSubmitTimeout:
    // that specific failure means we don't know whether Google actually
    // started (and will bill) the generation, so a retry must not be allowed
    // to start a genuinely second submission — it should keep reconciling to
    // this same outcome. The fingerprint binds the key to this exact request
    // so a reused/guessed key naming a different room, source, or edit never
    // gets handed back a mismatched job.
    const fingerprint = JSON.stringify({
      provider: 'nano-banana',
      roomId: validated.data.roomId,
      styleVariant: validated.data.styleVariant,
      sourceAssetPath: validated.data.sourceAssetPath,
      editInstruction: validated.data.editInstruction,
      simulate: validated.data.simulate,
    });
    const jobId = await reserveIdempotentSubmission(
      validated.data.idempotencyKey,
      fingerprint,
      async () => {
        const result = await provider.submit({
          provider: 'nano-banana',
          outputType: 'image',
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
    return NextResponse.json({ jobId, demoMode, provider: demoMode ? 'mock' : 'nano-banana' });
  } catch (error) {
    console.error('[nano-banana/generate] submission failed:', safeErrorSummary(error));
    if (isIdempotencyKeyMismatchError(error)) {
      return NextResponse.json({ error: (error as Error).message }, { status: 409 });
    }
    // A definite, pre-billing failure (the approved source fell out of the
    // TTL cache before this refinement used it) — a distinct status is what
    // lets the client recognize it and clear the stale approval, instead of
    // retrying the exact same request and failing the same way forever.
    if (isSourceExpiredError(error)) {
      return NextResponse.json({ error: (error as Error).message }, { status: 410 });
    }
    // generateContent's AbortSignal stops our own wait, but cannot recall
    // generation Google's servers may have already started and billed by the
    // time it fired — telling the caller this was a definite failure would
    // invite an immediate retry that risks a duplicate charge, so this gets
    // the same distinct, honest response as Higgsfield's isSubmitTimeout case.
    if (isSubmitTimeout(error)) {
      return NextResponse.json(
        {
          error:
            'The request to Nano Banana timed out. It may have already been accepted and could still be running (and billed) — please wait a minute and check before submitting again, to avoid a possible duplicate charge.',
        },
        { status: 504 },
      );
    }
    return NextResponse.json({ error: 'Generation could not be started. Please try again.' }, { status: 502 });
  }
}

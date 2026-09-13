import { NextResponse, type NextRequest } from 'next/server';
import { LIVE_RUN_NOT_CONFIRMED_MESSAGE, resolveProviderForSubmit } from '@/lib/ai/registry.server';
import { hasStableJobIdSigningSecret, JOB_ID_SIGNING_SECRET_REQUIRED_MESSAGE } from '@/lib/ai/jobId';
import { checkRateLimit, clientKeyFromRequest } from '@/lib/ai/rateLimit.server';
import { isSubmitTimeout } from '@/lib/ai/higgsfield.server';
import { isIdempotencyKeyMismatchError, reserveIdempotentSubmission } from '@/lib/ai/idempotency.server';
import { safeErrorSummary } from '@/lib/ai/errorLogging.server';
import {
  clipPlanEntry,
  isAnimatableStage,
  transformationClipPlan,
} from '@/lib/ai/transformationClips.server';
import { TRANSFORMATION_ROOM_ID } from '@/data/kitchenTransformation';

export const dynamic = 'force-dynamic';

/** The clip plan, so an operator/UI can see what would be generated without
 *  submitting anything. Purely derived from committed source. */
export async function GET() {
  return NextResponse.json({
    roomId: TRANSFORMATION_ROOM_ID,
    clips: transformationClipPlan(),
  });
}

/**
 * Submit ONE transformation micro-clip to Higgsfield.
 *
 * Never fires on page load: it requires an explicit POST naming a stage, and
 * inherits every guard the other generate routes use (rate limit, the
 * AI_ALLOW_LIVE master switch via resolveProviderForSubmit, the cost
 * confirmation, signed job ids, and idempotent reservation so a retry can
 * never start a second billed job).
 *
 * The one thing this route does NOT take from the caller is the source image
 * path. It derives that itself from the requested stage id, so — unlike a
 * free-form sourceAssetPath — there is no way to steer Higgsfield's
 * credentialed fetch at an arbitrary URL through this endpoint.
 */
export async function POST(request: NextRequest) {
  const rateLimit = checkRateLimit(`transformation-clip:${clientKeyFromRequest(request)}`);
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

  const payload = (body ?? {}) as {
    stageId?: unknown;
    idempotencyKey?: unknown;
    liveRunConfirmed?: unknown;
  };

  if (typeof payload.stageId !== 'string' || !isAnimatableStage(payload.stageId)) {
    return NextResponse.json(
      { error: 'stageId must name a stage of the transformation that introduces objects.' },
      { status: 400 },
    );
  }
  if (typeof payload.idempotencyKey !== 'string' || payload.idempotencyKey.length < 8) {
    return NextResponse.json({ error: 'An idempotencyKey of at least 8 characters is required.' }, { status: 400 });
  }

  const entry = clipPlanEntry(payload.stageId);
  if (!entry) {
    return NextResponse.json({ error: 'No clip plan exists for that stage.' }, { status: 400 });
  }

  const { provider, demoMode } = resolveProviderForSubmit('higgsfield');

  if (!demoMode && !hasStableJobIdSigningSecret()) {
    return NextResponse.json({ error: JOB_ID_SIGNING_SECRET_REQUIRED_MESSAGE }, { status: 500 });
  }
  if (!demoMode && payload.liveRunConfirmed !== true) {
    return NextResponse.json({ error: LIVE_RUN_NOT_CONFIRMED_MESSAGE }, { status: 428 });
  }

  try {
    const fingerprint = JSON.stringify({
      kind: 'transformation-clip',
      stageId: entry.stageId,
      sourceAssetPath: entry.sourceAssetPath,
    });
    const jobId = await reserveIdempotentSubmission(
      payload.idempotencyKey,
      fingerprint,
      async () => {
        const result = await provider.submit({
          provider: 'higgsfield',
          outputType: 'video',
          roomId: TRANSFORMATION_ROOM_ID,
          styleVariant: 'warm-oak',
          sourceAssetPath: entry.sourceAssetPath,
          prompt: entry.prompt,
          aspectRatio: '9:16',
        });
        return result.jobId;
      },
      // A submit timeout is ambiguous, not a definite failure: the call cannot
      // be cancelled, so the job may already be accepted and billed. Keeping
      // the reservation makes a retry reconcile to this same outcome instead
      // of starting a genuinely second billed job.
      { isAmbiguousFailure: isSubmitTimeout },
    );
    return NextResponse.json({ jobId, stageId: entry.stageId, demoMode, prompt: entry.prompt });
  } catch (error) {
    if (isIdempotencyKeyMismatchError(error)) {
      return NextResponse.json(
        { error: 'That idempotencyKey was already used for a different clip request.' },
        { status: 409 },
      );
    }
    if (isSubmitTimeout(error)) {
      // Ambiguous on purpose: the submit call cannot be cancelled, so the job
      // may already have been accepted and billed. Saying "failed, retry"
      // here would invite a genuine duplicate.
      return NextResponse.json(
        {
          error:
            'The clip submission timed out. Higgsfield may still have accepted the job, so it has not been retried automatically.',
        },
        { status: 504 },
      );
    }
    return NextResponse.json({ error: safeErrorSummary(error) }, { status: 502 });
  }
}

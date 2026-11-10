import { NextResponse } from 'next/server';
import {
  LIGHTING_ENVELOPE,
  TRANSFORMATION_CAMERA,
  TRANSFORMATION_DURATION_SEC,
  TRANSFORMATION_OUTPUT,
  TRANSFORMATION_ROOM_ID,
  TRANSFORMATION_STAGES,
} from '@/data/kitchenTransformation';
import {
  exposureAtTime,
  findTransformationManifestProblems,
  furnitureAddedAtStage,
  visibleFurnitureIdsAtStage,
} from '@/lib/transformation';

/**
 * The manifest, served as JSON.
 *
 * This exists so the node-side pipeline (render-stage-stills, the Higgsfield
 * clip submitter, compose-transformation) reads stage ids, timings and
 * per-stage object sets from the SAME TypeScript module the app renders from,
 * instead of keeping a second copy of the timings in a script. That is the
 * whole point of the manifest being a single source of truth.
 *
 * Read-only and derived entirely from committed source — no secrets, no
 * request-dependent data.
 */
export async function GET() {
  const problems = findTransformationManifestProblems();

  return NextResponse.json({
    roomId: TRANSFORMATION_ROOM_ID,
    durationSec: TRANSFORMATION_DURATION_SEC,
    output: TRANSFORMATION_OUTPUT,
    camera: TRANSFORMATION_CAMERA,
    // Exported so the compositor applies the SAME control points the app and
    // the tests use. It previously kept its own hard-coded copy, which meant
    // editing the envelope here changed playback metadata and tests but not
    // the rendered video — exactly the drift a single source of truth is
    // supposed to make impossible.
    lightingEnvelope: LIGHTING_ENVELOPE,
    valid: problems.length === 0,
    problems,
    stages: TRANSFORMATION_STAGES.map((stage) => ({
      ...stage,
      exposureAtStart: exposureAtTime(stage.start),
      exposureAtEnd: exposureAtTime(stage.end),
      addsFurnitureIds: furnitureAddedAtStage(stage.id).map((i) => i.id),
      visibleFurnitureIds: visibleFurnitureIdsAtStage(stage.id),
    })),
  });
}

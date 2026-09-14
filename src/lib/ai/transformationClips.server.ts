import 'server-only';
import {
  TRANSFORMATION_CAMERA,
  TRANSFORMATION_OUTPUT,
  TRANSFORMATION_STAGES,
} from '@/data/kitchenTransformation';
import { furnitureAddedAtStage } from '@/lib/transformation';
import type { TransformationStageId } from '@/lib/types';

/**
 * Higgsfield micro-clips for the room transformation.
 *
 * The division of labour here is deliberate and is the reason the sequence
 * stays stable: Higgsfield is asked ONLY for plausible motion between two
 * already-approved, already-rendered architectural states. It is never asked
 * to invent geometry, choose a camera, decide what furniture exists, or
 * control edit timing — all of which the manifest and the deterministic
 * compositor own. A model that cannot change the room cannot make the room
 * drift.
 *
 * Every clip is therefore image-to-video from one locked-camera stage still,
 * with a prompt whose entire job is to forbid change.
 */

/** Published, publicly fetchable still for a stage (written by scripts/render-stage-stills.mjs). */
export function stageStillPath(stageId: TransformationStageId): string {
  return `/transformation/stages/${stageId}.jpg`;
}

/**
 * Stages worth animating: the ones where a hand introduces something. The
 * three lighting-only stages at the end are a pure exposure ramp that the
 * compositor reproduces exactly from measured values, so spending a billed
 * generation on them would buy nothing but risk.
 */
export function animatableStageIds(): TransformationStageId[] {
  return TRANSFORMATION_STAGES.filter(
    (s) => s.gesture !== 'none' && furnitureAddedAtStage(s.id).length > 0,
  ).map((s) => s.id);
}

export function isAnimatableStage(stageId: string): stageId is TransformationStageId {
  return (animatableStageIds() as string[]).includes(stageId);
}

const PRESERVATION_CLAUSE = [
  'Locked architectural camera: the camera must not move, pan, orbit, zoom, dolly, shake or change lens.',
  'Preserve this exact kitchen geometry, perspective, wall planes, ceiling height, floor, window, cabinetry and every piece of furniture already visible.',
  'The composition must remain pixel-stable: no geometry breathing, no furniture morphing, no resizing, no repositioning.',
  'Do not add, remove or replace any architecture. Do not change any material outside the named object.',
  'No people, no text, no watermark, no logos, no on-screen interface.',
].join(' ');

/**
 * The prompt for one stage's clip.
 *
 * It is strictly differential — it names only what this stage adds, and
 * spends the rest of its budget forbidding change. A prompt that re-described
 * the whole room would invite the model to regenerate it.
 */
export function buildStageClipPrompt(stageId: TransformationStageId): string {
  const stage = TRANSFORMATION_STAGES.find((s) => s.id === stageId);
  if (!stage) throw new Error(`Unknown transformation stage: ${stageId}`);
  const added = furnitureAddedAtStage(stageId).map((i) => i.shopLabel);
  const addedList = added.length > 0 ? ` The new element(s): ${added.join(', ')}.` : '';
  return [
    `Warm modern luxury kitchen interior, ${stage.lighting.replace('-', ' ')} lighting.`,
    PRESERVATION_CLAUSE,
    `Introduce only this change: ${stage.addsDescription}.${addedList}`,
    'The change should appear as a single physically plausible placement, settling immediately and then holding perfectly still.',
    `Camera is fixed at position (${TRANSFORMATION_CAMERA.position.x}, ${TRANSFORMATION_CAMERA.position.y}, ${TRANSFORMATION_CAMERA.position.z}) looking at (${TRANSFORMATION_CAMERA.lookAt.x}, ${TRANSFORMATION_CAMERA.lookAt.y}, ${TRANSFORMATION_CAMERA.lookAt.z}).`,
  ].join(' ');
}

/**
 * Whole frames available to a clip that must finish on `boundarySec`, having
 * started no earlier than `fromSec`.
 *
 * Boundaries are rounded to a frame FIRST and then differenced — the same
 * order scripts/clip_schedule.py uses — because differencing the seconds and
 * rounding afterwards can disagree by a frame when a boundary lands on a half
 * frame, and that frame is the one the clip is supposed to land on.
 */
export function clipWindowFrames(fromSec: number, boundarySec: number): number {
  const fps = TRANSFORMATION_OUTPUT.fps;
  return Math.round(boundarySec * fps) - Math.round(fromSec * fps);
}

export interface TransformationClipPlanEntry {
  stageId: TransformationStageId;
  /** Still this clip animates FROM — the previous stage's approved state. */
  sourceStageId: TransformationStageId;
  sourceAssetPath: string;
  prompt: string;
  /**
   * The exact span the compositor will fit this clip into, NOT a parameter
   * sent to the provider: `/v1/image2video/dop` exposes no duration control
   * at all (see `DoPImage2VideoInput` in @higgsfield/client), so a live clip
   * returns at the model's own default length whatever is asked for.
   *
   * That is safe because a longer result is resampled across this window
   * rather than truncated (scripts/clip_schedule.py), so the whole placement
   * motion is kept and no billed second goes unused — it just plays at the
   * window's pace. Named for what it is so an operator reading the plan is
   * not told a duration the provider will silently ignore.
   */
  windowSec: number;
}

/**
 * The full clip plan, derived from the manifest.
 *
 * Several short, tightly constrained clips rather than one long generation:
 * a long clip has to hold the whole room stable across many seconds of
 * sampling, which is exactly where drift accumulates.
 */
export function transformationClipPlan(): TransformationClipPlanEntry[] {
  const plan: TransformationClipPlanEntry[] = [];
  for (const stage of TRANSFORMATION_STAGES) {
    if (!isAnimatableStage(stage.id)) continue;
    const previous = TRANSFORMATION_STAGES[stage.index - 1];
    if (!previous) continue;
    plan.push({
      stageId: stage.id,
      sourceStageId: previous.id,
      // Server-derived from a known stage id — never a caller-supplied path,
      // so this route cannot be used to point Higgsfield's credentialed fetch
      // at an arbitrary URL the way a free-form sourceAssetPath could.
      sourceAssetPath: stageStillPath(previous.id),
      prompt: buildStageClipPrompt(stage.id),
      // The clip is the transition INTO this stage, so it plays across the
      // interval immediately BEFORE the boundary and is scheduled to finish
      // exactly on it (scripts/clip_schedule.py). Its usable length is
      // therefore the PREVIOUS stage's span, not this one's. Asking for a
      // clip as long as the target stage bought seconds that could never be
      // shown: counter-details runs 2.0 s but has only cabinet-wall's 0.65 s
      // to play in, so two thirds of that paid generation was trimmed away
      // unseen before it ever reached the master.
      //
      // Quoted as the window's whole-frame count rather than the raw
      // difference, so the number an operator generates against is exactly
      // the number of frames the compositor will keep — a boundary landing on
      // a half frame (0.75 s x 30 = 22.5) otherwise leaves the two off by one.
      windowSec: clipWindowFrames(previous.start, stage.start) / TRANSFORMATION_OUTPUT.fps,
    });
  }
  return plan;
}

export function clipPlanEntry(stageId: TransformationStageId): TransformationClipPlanEntry | undefined {
  return transformationClipPlan().find((p) => p.stageId === stageId);
}

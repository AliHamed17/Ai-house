/**
 * The binding layer between the transformation video, the manifest and the
 * real-time 3D room.
 *
 * Everything here is pure and dependency-free so the same functions run in
 * the browser (RoomTransformation, the R3F scene), in unit tests, and in the
 * node render/compose scripts — which is what keeps `video.currentTime`, the
 * stage id, and the set of visible 3D objects from ever disagreeing.
 */

import type { FurnitureItem, TransformationStageId } from '@/lib/types';
import {
  LIGHTING_ENVELOPE,
  TRANSFORMATION_DURATION_SEC,
  TRANSFORMATION_STAGES,
  type TransformationStageSpec,
} from '@/data/kitchenTransformation';
import { furnitureByRoom } from '@/data/furniture';
import { TRANSFORMATION_ROOM_ID } from '@/data/kitchenTransformation';

/** Stage ids in playback order. */
export const TRANSFORMATION_STAGE_IDS: readonly TransformationStageId[] =
  TRANSFORMATION_STAGES.map((s) => s.id);

/** The first stage — the bare shell the sequence starts from. */
export const FIRST_STAGE_ID: TransformationStageId = TRANSFORMATION_STAGES[0].id;

/** The last stage — the finished, warm-lit room. */
export const FINAL_STAGE_ID: TransformationStageId =
  TRANSFORMATION_STAGES[TRANSFORMATION_STAGES.length - 1].id;

const STAGE_BY_ID = new Map<TransformationStageId, TransformationStageSpec>(
  TRANSFORMATION_STAGES.map((s) => [s.id, s]),
);

export function getStage(id: TransformationStageId): TransformationStageSpec {
  const stage = STAGE_BY_ID.get(id);
  if (!stage) throw new Error(`Unknown transformation stage: ${id}`);
  return stage;
}

/**
 * Map a playback position to the stage being shown.
 *
 * Boundaries are half-open [start, end) so a time landing exactly on a
 * boundary reports the stage that is *starting*, matching what the frame at
 * that timestamp actually shows. Times past the end clamp to the final stage
 * rather than returning null, so a video that overruns its nominal duration
 * by a frame never blanks the 3D room.
 */
export function getTransformationStageAtTime(timeSec: number): TransformationStageSpec {
  if (!Number.isFinite(timeSec) || timeSec <= 0) return TRANSFORMATION_STAGES[0];
  for (const stage of TRANSFORMATION_STAGES) {
    if (timeSec >= stage.start && timeSec < stage.end) return stage;
  }
  return TRANSFORMATION_STAGES[TRANSFORMATION_STAGES.length - 1];
}

/** Convenience wrapper returning just the id. */
export function getTransformationStageIdAtTime(timeSec: number): TransformationStageId {
  return getTransformationStageAtTime(timeSec).id;
}

/** Playback time at which a stage begins — the inverse mapping. */
export function getTimeForStage(id: TransformationStageId): number {
  return getStage(id).start;
}

/** 0..1 progress through the whole sequence. */
export function sequenceProgress(timeSec: number): number {
  if (!Number.isFinite(timeSec)) return 0;
  return Math.min(Math.max(timeSec / TRANSFORMATION_DURATION_SEC, 0), 1);
}

/** Map 0..1 scroll/scrub progress back to a playback time. */
export function timeForProgress(progress: number): number {
  const p = Math.min(Math.max(progress, 0), 1);
  return p * TRANSFORMATION_DURATION_SEC;
}

const KITCHEN_FURNITURE: readonly FurnitureItem[] = furnitureByRoom[TRANSFORMATION_ROOM_ID] ?? [];

/**
 * Furniture visible once `stageId` has been reached.
 *
 * Cumulative: a piece introduced at an earlier stage stays visible for the
 * rest of the sequence, which is the reference's core invariant ("once an
 * object appears it never leaves"). Items with no `transformationStage` are
 * always present.
 */
export function visibleFurnitureAtStage(stageId: TransformationStageId): FurnitureItem[] {
  const upTo = getStage(stageId).index;
  return KITCHEN_FURNITURE.filter((item) => {
    if (!item.transformationStage) return true;
    return getStage(item.transformationStage).index <= upTo;
  });
}

/** Ids only — used by the still renderer and the assembly scripts. */
export function visibleFurnitureIdsAtStage(stageId: TransformationStageId): string[] {
  return visibleFurnitureAtStage(stageId).map((i) => i.id);
}

/** Furniture introduced *at* this stage (not before it). */
export function furnitureAddedAtStage(stageId: TransformationStageId): FurnitureItem[] {
  return KITCHEN_FURNITURE.filter((i) => i.transformationStage === stageId);
}

/**
 * Is this item visible in the given stage? Used by the 3D scene, which
 * renders every room's furniture and needs a per-item answer.
 *
 * Only the transforming room is stage-gated: furniture in the other thirteen
 * rooms is unaffected by the kitchen sequence and always renders.
 */
export function isFurnitureVisibleAtStage(
  item: FurnitureItem,
  stageId: TransformationStageId | null,
): boolean {
  if (stageId === null) return true;
  if (item.roomId !== TRANSFORMATION_ROOM_ID) return true;
  if (!item.transformationStage) return true;
  return getStage(item.transformationStage).index <= getStage(stageId).index;
}

/**
 * Exposure multiplier at a playback time, linearly interpolated from the
 * envelope measured off the reference. 1.0 is the finished daylight hold.
 */
export function exposureAtTime(timeSec: number): number {
  const t = Math.min(Math.max(timeSec, 0), TRANSFORMATION_DURATION_SEC);
  const pts = LIGHTING_ENVELOPE;
  if (t <= pts[0].t) return pts[0].exposure;
  for (let i = 1; i < pts.length; i += 1) {
    const a = pts[i - 1];
    const b = pts[i];
    if (t <= b.t) {
      const span = b.t - a.t;
      if (span <= 0) return b.exposure;
      const k = (t - a.t) / span;
      return a.exposure + (b.exposure - a.exposure) * k;
    }
  }
  return pts[pts.length - 1].exposure;
}

/**
 * Structural problems in the manifest. Returns an empty array when the
 * manifest is coherent; the unit tests assert exactly that, so a hand-edited
 * timing that breaks monotonicity fails CI rather than producing a broken
 * video.
 */
export function findTransformationManifestProblems(): string[] {
  const problems: string[] = [];
  const stages = TRANSFORMATION_STAGES;

  if (stages.length === 0) return ['Manifest has no stages.'];
  if (stages[0].start !== 0) problems.push(`First stage must start at 0, got ${stages[0].start}.`);

  stages.forEach((stage, i) => {
    if (stage.index !== i) problems.push(`Stage ${stage.id} has index ${stage.index}, expected ${i}.`);
    if (stage.end <= stage.start) {
      problems.push(`Stage ${stage.id} ends (${stage.end}) at or before it starts (${stage.start}).`);
    }
    if (i > 0 && stage.start !== stages[i - 1].end) {
      problems.push(
        `Stage ${stage.id} starts at ${stage.start} but ${stages[i - 1].id} ends at ${stages[i - 1].end} — gaps and overlaps both break time->stage mapping.`,
      );
    }
  });

  const last = stages[stages.length - 1];
  if (Math.abs(last.end - TRANSFORMATION_DURATION_SEC) > 1e-9) {
    problems.push(
      `Final stage ends at ${last.end} but the sequence duration is ${TRANSFORMATION_DURATION_SEC}.`,
    );
  }

  const ids = new Set<string>();
  for (const stage of stages) {
    if (ids.has(stage.id)) problems.push(`Duplicate stage id: ${stage.id}.`);
    ids.add(stage.id);
  }

  // Every stage-tagged piece of furniture must name a stage that exists.
  for (const item of KITCHEN_FURNITURE) {
    if (item.transformationStage && !ids.has(item.transformationStage)) {
      problems.push(`Furniture ${item.id} references unknown stage ${item.transformationStage}.`);
    }
  }

  // A stage whose gesture is 'none' must not introduce objects: in the
  // reference, nothing ever appears without a hand causing it.
  for (const stage of stages) {
    if (stage.gesture === 'none' && furnitureAddedAtStage(stage.id).length > 0) {
      problems.push(
        `Stage ${stage.id} has no gesture but introduces furniture — objects must always be caused by a hand.`,
      );
    }
  }

  // Lighting may only change once the room is finished and the hands are gone.
  const firstNonDaylight = stages.findIndex((s) => s.lighting !== 'daylight');
  if (firstNonDaylight >= 0) {
    for (let i = firstNonDaylight; i < stages.length; i += 1) {
      if (furnitureAddedAtStage(stages[i].id).length > 0) {
        problems.push(
          `Stage ${stages[i].id} introduces furniture after the lighting arc has started — the reference finishes furnishing first.`,
        );
      }
    }
  }

  return problems;
}

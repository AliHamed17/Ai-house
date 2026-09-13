/**
 * THE transformation manifest — single source of truth for the kitchen
 * reveal sequence.
 *
 * Every timestamp here was measured from the supplied reference video (see
 * analysis/reference-transformation-video.json for the raw measurement and
 * method). Nothing in this file is an estimate.
 *
 * This one manifest drives, with no duplicated timing values anywhere else:
 *   1. the generation prompts for each stage still
 *   2. the locked-camera stage-still render (scripts/render-stage-stills.mjs)
 *   3. Higgsfield micro-clip sequencing (src/lib/ai/transformationClips.server.ts)
 *   4. deterministic video assembly (scripts/compose-transformation.mjs)
 *   5. playback -> stage events in the RoomTransformation component
 *   6. the real-time 3D room's stage state (src/lib/transformation.ts)
 *
 * The furniture that appears at each stage is NOT listed here: it is derived
 * from src/data/furniture.ts's `transformationStage` field, so the video and
 * the 3D scene are physically incapable of showing different sets of objects.
 */

import type {
  RoomId,
  TransformationGesture,
  TransformationLighting,
  TransformationStageId,
} from '@/lib/types';

/** Room this sequence transforms. */
export const TRANSFORMATION_ROOM_ID: RoomId = 'kitchen';

/**
 * Total sequence length, matching the reference's measured 13.37 s.
 * The compositor asserts the assembled master matches this.
 */
export const TRANSFORMATION_DURATION_SEC = 13.37;

/**
 * Locked architectural camera, in the same world frame as
 * RoomDef.floorPolygon / cameraSpawn.
 *
 * Chosen from this house's real geometry, not the reference's: it stands back
 * in the dining zone (which is an open threshold to the kitchen, not a walled
 * room) looking west along -X at kitchen_w, the kitchen's only solid wall.
 *
 * The numbers are set by what has to be in frame, and were corrected against
 * rendered stills rather than assumed:
 *   - 70 deg vertical FOV gives a ~43 deg horizontal field at 9:16, covering
 *     3.6 m at the wall plane. A 60 deg FOV covered only 2.96 m and cropped
 *     both flanking tall cabinets out of the shot.
 *   - Standing at y=1.95 and aiming down at y=1.15 brings the island's near
 *     face and the stool backs into the lower third. At eye height aimed
 *     level, the seating fell below the bottom edge entirely.
 *
 * `position`/`lookAt` are given explicitly rather than as a yaw so the still
 * renderer never has to reproduce the first-person controller's yaw
 * convention. For reference, forward = (-sin y, -cos y) makes this view
 * yaw = PI/2, which is also the kitchen's authored cameraSpawnYaw.
 */
export const TRANSFORMATION_CAMERA = {
  position: { x: 4.62, y: 1.95, z: 5.65 },
  lookAt: { x: 0, y: 1.15, z: 5.65 },
  /** Vertical FOV in degrees; 9:16 portrait makes the horizontal field ~43 deg. */
  fovDeg: 70,
  near: 0.05,
  far: 60,
} as const;

/** Delivery format for the assembled master. */
export const TRANSFORMATION_OUTPUT = {
  widthPx: 1080,
  heightPx: 1920,
  fps: 30,
  aspectRatio: '9:16',
} as const;

export interface TransformationStageSpec {
  id: TransformationStageId;
  index: number;
  /** Seconds from sequence start — measured from the reference. */
  start: number;
  end: number;
  label: string;
  caption: string;
  gesture: TransformationGesture;
  gestureFrom: 'top' | 'right' | 'left' | 'bottom' | null;
  lighting: TransformationLighting;
  /**
   * Prompt fragment naming ONLY what this stage adds. Stage prompts are
   * always differential ("preserve everything, add only X") so an image or
   * video model is never asked to redesign an approved composition.
   */
  addsDescription: string;
}

/**
 * Measured stage table. Boundaries are exactly the reference's measured
 * transition timestamps; see analysis/reference-transformation-video.json
 * `stages[].start` for the matching evidence entry.
 */
export const TRANSFORMATION_STAGES: readonly TransformationStageSpec[] = [
  {
    id: 'empty',
    index: 0,
    start: 0,
    end: 0.75,
    label: 'Bare shell',
    caption: 'The kitchen as it stands today — bare plaster and stone.',
    gesture: 'open-hand-sweep',
    gestureFrom: 'top',
    lighting: 'daylight',
    addsDescription: 'nothing — the unfurnished architectural shell only',
  },
  {
    id: 'upper-cabinets',
    index: 1,
    start: 0.75,
    end: 1.5,
    label: 'Upper cabinetry',
    caption: 'Handleless taupe wall cabinets land on the solid wall.',
    gesture: 'pinch-drag',
    gestureFrom: 'right',
    lighting: 'daylight',
    addsDescription:
      'handleless matte taupe upper wall cabinets on the left wall only, aligned to the existing architecture',
  },
  {
    id: 'backsplash',
    index: 2,
    start: 1.5,
    end: 3.1,
    label: 'Stone backsplash',
    caption: 'A pale veined stone splashback runs the length of the counter.',
    gesture: 'horizontal-sweep',
    gestureFrom: 'left',
    lighting: 'daylight',
    addsDescription:
      'a warm ivory pale-limestone splashback slab with restrained veining beneath the upper cabinets',
  },
  {
    id: 'cabinet-wall',
    index: 3,
    start: 3.1,
    end: 3.75,
    label: 'Full cabinet wall',
    caption: 'Tall display joinery and the base run complete the elevation.',
    gesture: 'two-sided-placement',
    gestureFrom: 'left',
    lighting: 'daylight',
    addsDescription:
      'tall dark glass-front display cabinets flanking the run, plus the base cabinetry and its stone worktop',
  },
  {
    id: 'counter-details',
    index: 4,
    start: 3.75,
    end: 5.75,
    label: 'Working details',
    caption: 'Sink, tap, cooktop and a little greenery.',
    gesture: 'repeated-pinch',
    gestureFrom: 'right',
    lighting: 'daylight',
    addsDescription:
      'an undermount sink with a slim dark tap, an integrated induction cooktop, and one small potted plant on the worktop',
  },
  {
    id: 'suspended-feature',
    index: 5,
    start: 5.75,
    end: 6.9,
    label: 'Suspended shelf',
    caption: 'A slim ceiling-hung display shelf adds a mid-height layer.',
    gesture: 'pinch-from-ceiling',
    gestureFrom: 'top',
    lighting: 'daylight',
    addsDescription:
      'a slim ceiling-hung open display shelf on thin dark rods above the rear half of the worktop',
  },
  {
    id: 'island',
    index: 6,
    start: 6.9,
    end: 7.7,
    label: 'Island',
    caption: 'The island arrives and the room gains real depth.',
    gesture: 'two-finger-place',
    gestureFrom: 'right',
    lighting: 'daylight',
    addsDescription:
      'a central island with a fluted natural-oak base and a pale stone worktop, plus two dark bronze pendants above it',
  },
  {
    id: 'stools',
    index: 7,
    start: 7.7,
    end: 8.7,
    label: 'Seating',
    caption: 'Four upholstered stools tuck under the island.',
    gesture: 'repeated-pinch',
    gestureFrom: 'right',
    lighting: 'daylight',
    addsDescription:
      'four upholstered counter stools on slim bronze legs, feet flat on the floor, tucked under the island',
  },
  {
    id: 'decor',
    index: 8,
    start: 8.7,
    end: 10.15,
    label: 'Styling',
    caption: 'A vase, a bowl — and the hands leave.',
    gesture: 'repeated-pinch',
    gestureFrom: 'left',
    lighting: 'daylight',
    addsDescription:
      'a sculptural vase with bare branches and one low stone bowl on the island, nothing more',
  },
  {
    id: 'daylight-hold',
    index: 9,
    start: 10.15,
    end: 11.15,
    label: 'Finished in daylight',
    caption: 'The finished room holds, then the day begins to fall away.',
    gesture: 'none',
    gestureFrom: null,
    lighting: 'daylight-dimming',
    addsDescription: 'nothing — the completed room, with daylight stepping down',
  },
  {
    id: 'dusk',
    index: 10,
    start: 11.15,
    end: 11.95,
    label: 'Dusk',
    caption: 'Dusk. The display cabinets catch the first warm glow.',
    gesture: 'none',
    gestureFrom: null,
    lighting: 'dusk',
    addsDescription: 'nothing — the completed room at its darkest, before the lights come up',
  },
  {
    id: 'warm-reveal',
    index: 11,
    start: 11.95,
    end: TRANSFORMATION_DURATION_SEC,
    label: 'Warm reveal',
    caption: 'Integrated 2700K lighting comes alive. This is the finished kitchen.',
    gesture: 'none',
    gestureFrom: null,
    lighting: 'warm-evening',
    addsDescription:
      'nothing new — integrated warm 2700-3000K lighting switches on: display-cabinet glow, under-cabinet task strip, shelf accent and the island pendants',
  },
] as const;

/**
 * Luminance envelope measured from the reference, normalised so the finished
 * daylight hold is 1.0. The compositor applies this as an exposure curve to
 * the rendered stills so the emotional arc of the reference is reproduced
 * numerically rather than by eye.
 *
 * Source values (reference content-region mean luminance):
 * 99.0 at 10.10 s, 65.4 at 11.15 s, 69.0 at 11.90 s, 101.6 at 12.00 s,
 * 121.8 at 13.25 s.
 */
export const LIGHTING_ENVELOPE: readonly { t: number; exposure: number }[] = [
  { t: 0, exposure: 1.0 },
  { t: 10.1, exposure: 1.0 },
  { t: 10.15, exposure: 0.947 },
  { t: 10.55, exposure: 0.838 },
  { t: 10.65, exposure: 0.793 },
  { t: 11.15, exposure: 0.661 },
  { t: 11.6, exposure: 0.663 },
  { t: 11.65, exposure: 0.693 },
  { t: 11.95, exposure: 0.76 },
  { t: 12.0, exposure: 1.026 },
  { t: 12.5, exposure: 1.068 },
  { t: 13.25, exposure: 1.23 },
  { t: TRANSFORMATION_DURATION_SEC, exposure: 1.23 },
] as const;

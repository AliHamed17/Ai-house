import { describe, expect, it } from 'vitest';
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
  FINAL_STAGE_ID,
  FIRST_STAGE_ID,
  furnitureAddedAtStage,
  getStage,
  getTimeForStage,
  getTransformationStageAtTime,
  getTransformationStageIdAtTime,
  isFurnitureVisibleAtStage,
  sequenceProgress,
  timeForProgress,
  visibleFurnitureAtStage,
  visibleFurnitureIdsAtStage,
} from '@/lib/transformation';
import { furnitureByRoom } from '@/data/furniture';
import { houseModel } from '@/data/house';
import type { FurnitureItem } from '@/lib/types';

const kitchen = furnitureByRoom.kitchen ?? [];

describe('transformation manifest', () => {
  it('is structurally coherent', () => {
    expect(findTransformationManifestProblems()).toEqual([]);
  });

  it('covers the full duration with contiguous, monotonic stages', () => {
    expect(TRANSFORMATION_STAGES[0].start).toBe(0);
    for (let i = 1; i < TRANSFORMATION_STAGES.length; i += 1) {
      expect(TRANSFORMATION_STAGES[i].start).toBe(TRANSFORMATION_STAGES[i - 1].end);
      expect(TRANSFORMATION_STAGES[i].start).toBeGreaterThan(TRANSFORMATION_STAGES[i - 1].start);
    }
    expect(TRANSFORMATION_STAGES[TRANSFORMATION_STAGES.length - 1].end).toBe(TRANSFORMATION_DURATION_SEC);
  });

  it('matches the measured reference duration', () => {
    // analysis/reference-transformation-video.json metadata.durationSec
    expect(TRANSFORMATION_DURATION_SEC).toBe(13.37);
  });

  it('targets a vertical delivery format', () => {
    expect(TRANSFORMATION_OUTPUT.widthPx).toBeLessThan(TRANSFORMATION_OUTPUT.heightPx);
    expect(TRANSFORMATION_OUTPUT.fps).toBeGreaterThan(0);
  });
});

describe('video time to stage mapping', () => {
  it('maps a boundary to the stage that is starting', () => {
    for (const stage of TRANSFORMATION_STAGES) {
      expect(getTransformationStageIdAtTime(stage.start)).toBe(stage.id);
    }
  });

  it('clamps before the start and past the end rather than returning nothing', () => {
    expect(getTransformationStageIdAtTime(-5)).toBe(FIRST_STAGE_ID);
    expect(getTransformationStageIdAtTime(TRANSFORMATION_DURATION_SEC + 5)).toBe(FINAL_STAGE_ID);
    expect(getTransformationStageIdAtTime(Number.NaN)).toBe(FIRST_STAGE_ID);
  });

  it('round-trips stage -> time -> stage', () => {
    for (const stage of TRANSFORMATION_STAGES) {
      expect(getTransformationStageAtTime(getTimeForStage(stage.id)).id).toBe(stage.id);
    }
  });

  it('maps progress and time consistently in both directions', () => {
    expect(sequenceProgress(0)).toBe(0);
    expect(sequenceProgress(TRANSFORMATION_DURATION_SEC)).toBe(1);
    expect(sequenceProgress(TRANSFORMATION_DURATION_SEC * 2)).toBe(1);
    expect(timeForProgress(0)).toBe(0);
    expect(timeForProgress(1)).toBe(TRANSFORMATION_DURATION_SEC);
    expect(timeForProgress(0.5)).toBeCloseTo(TRANSFORMATION_DURATION_SEC / 2, 6);
  });

  it('throws on an unknown stage id rather than silently defaulting', () => {
    // @ts-expect-error deliberately invalid id
    expect(() => getStage('not-a-stage')).toThrow();
  });
});

describe('stage -> 3D state mapping', () => {
  it('never removes an object once it has appeared', () => {
    let previous = 0;
    for (const stage of TRANSFORMATION_STAGES) {
      const ids = visibleFurnitureIdsAtStage(stage.id);
      expect(ids.length).toBeGreaterThanOrEqual(previous);
      previous = ids.length;
    }
  });

  it('starts empty and ends with every kitchen piece visible', () => {
    expect(visibleFurnitureAtStage(FIRST_STAGE_ID)).toHaveLength(0);
    expect(visibleFurnitureIdsAtStage(FINAL_STAGE_ID).sort()).toEqual(kitchen.map((i) => i.id).sort());
  });

  it('shows exactly the pieces tagged to each stage, cumulatively', () => {
    for (const stage of TRANSFORMATION_STAGES) {
      const visible = new Set(visibleFurnitureIdsAtStage(stage.id));
      for (const item of kitchen) {
        const introduced = item.transformationStage ? getStage(item.transformationStage).index : -1;
        expect(visible.has(item.id)).toBe(introduced <= stage.index);
      }
    }
  });

  it('leaves every other room untouched by the kitchen sequence', () => {
    const livingSofa = (furnitureByRoom.living ?? [])[0];
    expect(livingSofa).toBeDefined();
    for (const stage of TRANSFORMATION_STAGES) {
      expect(isFurnitureVisibleAtStage(livingSofa, stage.id)).toBe(true);
    }
  });

  it('shows everything when no stage is active (the normal explorer state)', () => {
    for (const item of kitchen) {
      expect(isFurnitureVisibleAtStage(item, null)).toBe(true);
    }
  });

  it('introduces at least one object at every gesture stage', () => {
    for (const stage of TRANSFORMATION_STAGES) {
      if (stage.gesture === 'none') continue;
      if (stage.id === FIRST_STAGE_ID) continue; // establishing beat, adds nothing
      expect(furnitureAddedAtStage(stage.id).length).toBeGreaterThan(0);
    }
  });
});

describe('lighting envelope', () => {
  it('reproduces the reference arc: daylight, then dusk, then a brighter warm reveal', () => {
    const daylight = exposureAtTime(5);
    const dusk = exposureAtTime(11.4);
    const warm = exposureAtTime(13.2);
    expect(dusk).toBeLessThan(daylight);
    expect(warm).toBeGreaterThan(daylight);
    expect(warm).toBeGreaterThan(dusk);
  });

  it('clamps outside the sequence instead of extrapolating', () => {
    expect(exposureAtTime(-10)).toBe(exposureAtTime(0));
    expect(exposureAtTime(TRANSFORMATION_DURATION_SEC + 10)).toBe(exposureAtTime(TRANSFORMATION_DURATION_SEC));
  });

  it('only changes lighting after the room is fully furnished', () => {
    const firstLightingChange = TRANSFORMATION_STAGES.find((s) => s.lighting !== 'daylight');
    expect(firstLightingChange).toBeDefined();
    const furnishedByThen = visibleFurnitureIdsAtStage(firstLightingChange!.id);
    expect(furnishedByThen.sort()).toEqual(kitchen.map((i) => i.id).sort());
  });
});

describe('the envelope is not duplicated outside the manifest', () => {
  it('exports control points the compositor can consume instead of hard-coding its own', () => {
    // The compositor reads these from /api/transformation/manifest. If the
    // envelope stopped being exported, it would silently fall back to a stale
    // local copy and the rendered lighting arc would drift away from playback
    // metadata and these tests.
    expect(LIGHTING_ENVELOPE.length).toBeGreaterThan(2);
    for (const point of LIGHTING_ENVELOPE) {
      expect(Number.isFinite(point.t)).toBe(true);
      expect(point.exposure).toBeGreaterThan(0);
    }
  });

  it('is monotonic in time and spans the whole sequence', () => {
    for (let i = 1; i < LIGHTING_ENVELOPE.length; i += 1) {
      expect(LIGHTING_ENVELOPE[i].t).toBeGreaterThanOrEqual(LIGHTING_ENVELOPE[i - 1].t);
    }
    expect(LIGHTING_ENVELOPE[0].t).toBe(0);
    expect(LIGHTING_ENVELOPE[LIGHTING_ENVELOPE.length - 1].t).toBe(TRANSFORMATION_DURATION_SEC);
  });

  it('agrees with exposureAtTime at every control point', () => {
    for (const point of LIGHTING_ENVELOPE) {
      expect(exposureAtTime(point.t)).toBeCloseTo(point.exposure, 6);
    }
  });
});

describe('the transforming room is real house geometry', () => {
  it('names a room that exists', () => {
    expect(houseModel.rooms.some((r) => r.id === TRANSFORMATION_ROOM_ID)).toBe(true);
  });

  it('places the camera outside the transforming room, looking at its solid wall', () => {
    const room = houseModel.rooms.find((r) => r.id === TRANSFORMATION_ROOM_ID)!;
    const xs = room.floorPolygon.map((p) => p.x);
    // Standing back beyond the kitchen's own footprint (in the open dining
    // zone) is what makes the full cabinet elevation fit in frame.
    expect(TRANSFORMATION_CAMERA.position.x).toBeGreaterThan(Math.max(...xs));
    expect(TRANSFORMATION_CAMERA.lookAt.x).toBeLessThan(TRANSFORMATION_CAMERA.position.x);
    expect(TRANSFORMATION_CAMERA.position.y).toBeGreaterThan(0);
    expect(TRANSFORMATION_CAMERA.position.y).toBeLessThan(room.ceilingHeightM);
  });

  it('never buries the real kitchen window behind fitted joinery', () => {
    // window_kitchen_1 is authored architecture, so the design has to work
    // around it rather than through it. Only opaque fitted joinery counts as
    // burying it: a tap or a plant standing in front of a window over the
    // sink is normal kitchen design, not an obstruction, and the sill at
    // 1.0 m sits only 8 cm above the worktop precisely so that can happen.
    const OPAQUE_JOINERY = new Set(['wall-cabinet', 'tall-cabinet', 'base-run', 'backsplash', 'suspended-shelf']);

    const window = houseModel.openings.find((o) => o.id === 'window_kitchen_1');
    expect(window).toBeDefined();
    const wz0 = window!.position.z - window!.widthM / 2;
    const wz1 = window!.position.z + window!.widthM / 2;
    const wy0 = window!.sillM;
    const wy1 = window!.headM;

    const buriesWindow = (item: FurnitureItem) => {
      if (!OPAQUE_JOINERY.has(item.kind)) return false;
      const z0 = item.position.z - item.footprintM.depthM / 2;
      const z1 = item.position.z + item.footprintM.depthM / 2;
      const y0 = item.mountYM ?? 0;
      const y1 = y0 + item.heightM;
      const againstWall = item.position.x - item.footprintM.widthM / 2 < 0.1;
      return againstWall && z1 > wz0 && z0 < wz1 && y1 > wy0 && y0 < wy1;
    };

    expect(kitchen.filter(buriesWindow).map((i) => i.id)).toEqual([]);
  });
});

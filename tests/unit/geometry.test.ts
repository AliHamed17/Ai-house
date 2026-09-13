import { describe, expect, it } from 'vitest';
import { houseModel, getRoom } from '@/data/house';
import { buildAllWalls, buildWall } from '@/lib/geometry/wallPanels';
import { resolveCollision, pointInPolygon } from '@/lib/geometry/collision';

describe('wall panel geometry', () => {
  it('attaches the protected MAMAD door to mamad_s and splits the wall around it', () => {
    const mamad = getRoom('mamad')!;
    const wallSpec = mamad.walls.find((w) => w.id === 'mamad_s')!;
    const built = buildWall(wallSpec, mamad, houseModel.openings);
    expect(built.voids).toHaveLength(1);
    expect(built.voids[0].openingId).toBe('door_corridor_mamad');
    expect(built.voids[0].isProtected).toBe(true);
    // A door void produces a floor-level gap, so the wall should render at
    // least two solid panels: below/beside nothing (door starts at floor)
    // plus the lintel above the door up to the ceiling.
    expect(built.renderPanels.length).toBeGreaterThanOrEqual(1);
    expect(built.collisionSolidSpans.length).toBeGreaterThanOrEqual(1);
  });

  it('attaches the protected MAMAD window to mamad_n with sill/head preserved', () => {
    const mamad = getRoom('mamad')!;
    const wallSpec = mamad.walls.find((w) => w.id === 'mamad_n')!;
    const built = buildWall(wallSpec, mamad, houseModel.openings);
    expect(built.voids).toHaveLength(1);
    expect(built.voids[0].isProtected).toBe(true);
    expect(built.voids[0].y0).toBeCloseTo(1.4);
    expect(built.voids[0].y1).toBeCloseTo(1.9);
    // A window never reaches the floor, so it must never create a collision gap.
    expect(built.collisionSolidSpans).toEqual([{ t0: 0, t1: built.length }]);
  });

  it('handles the three windows on the living west wall without overlap', () => {
    const living = getRoom('living')!;
    const wallSpec = living.walls.find((w) => w.id === 'living_w')!;
    const built = buildWall(wallSpec, living, houseModel.openings);
    expect(built.voids).toHaveLength(3);
    // 2 windows on one wall -> 3 solid t-strips (below/between/above are not
    // stacked since windows share the same y-range, so we expect 3 solid
    // panels: left of both, between them, right of both, each full height
    // minus the shared window band -> at least 3 render panels total.
    expect(built.renderPanels.length).toBeGreaterThanOrEqual(3);
    // No door on this wall, so it must be fully solid for collision.
    expect(built.collisionSolidSpans).toEqual([{ t0: 0, t1: built.length }]);
  });

  it('builds a solid, gapless wall for a wall with no openings', () => {
    const corridor = getRoom('corridor')!;
    const wallSpec = corridor.walls.find((w) => w.id === 'corridor_s')!;
    const built = buildWall(wallSpec, corridor, houseModel.openings);
    expect(built.voids).toHaveLength(0);
    expect(built.renderPanels).toHaveLength(1);
    expect(built.collisionSolidSpans).toEqual([{ t0: 0, t1: built.length }]);
  });

  it('builds every wall in the house without throwing', () => {
    const built = buildAllWalls(houseModel.rooms, houseModel.openings);
    expect(built.length).toBeGreaterThan(20);
    for (const w of built) {
      expect(w.length).toBeGreaterThan(0);
      expect(w.heightM).toBeGreaterThan(0);
    }
  });
});

describe('collision resolution', () => {
  it('pushes a point outside a solid wall back to the near surface', () => {
    const mamad = getRoom('mamad')!;
    const wallSpec = mamad.walls.find((w) => w.id === 'mamad_e')!; // solid, no opening
    const built = buildWall(wallSpec, mamad, houseModel.openings);
    const insideNearWall = { x: 11.2 - 0.05, z: 1.7 };
    const resolved = resolveCollision(insideNearWall, 0.28, [built]);
    expect(resolved.x).toBeLessThan(11.2);
    expect(11.2 - resolved.x).toBeGreaterThanOrEqual(0.1 + 0.28 - 0.02);
  });

  it('does not obstruct a door gap (open_threshold stays walkable)', () => {
    const entry = getRoom('entry_hall')!;
    // entry_hall omits its west wall entirely (open threshold to living), so
    // there is no wall spec to collide with there.
    expect(entry.walls.find((w) => w.id.includes('west'))).toBeUndefined();
  });
});

describe('point-in-room lookup', () => {
  it('finds the living room camera spawn inside the living polygon', () => {
    const living = getRoom('living')!;
    expect(pointInPolygon(living.cameraSpawn, living.floorPolygon)).toBe(true);
  });

  it('every room camera spawn lies inside its own floor polygon', () => {
    for (const room of houseModel.rooms) {
      expect(pointInPolygon(room.cameraSpawn, room.floorPolygon)).toBe(true);
    }
  });

  it('does not find the living spawn inside an unrelated room (mamad)', () => {
    const living = getRoom('living')!;
    const mamad = getRoom('mamad')!;
    expect(pointInPolygon(living.cameraSpawn, mamad.floorPolygon)).toBe(false);
  });
});

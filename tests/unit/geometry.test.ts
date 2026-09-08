import { describe, expect, it } from 'vitest';
import { houseModel, getRoom, PLAYER_RADIUS_M } from '@/data/house';
import { buildAllWalls, buildWall } from '@/lib/geometry/wallPanels';
import { resolveCollision, pointInPolygon } from '@/lib/geometry/collision';
import { builtWalls } from '@/lib/geometry/builtHouse';

describe('wall panel geometry', () => {
  it('attaches the protected MAMAD door to mamad_w and splits the wall around it', () => {
    const mamad = getRoom('mamad')!;
    const wallSpec = mamad.walls.find((w) => w.id === 'mamad_w')!;
    const built = buildWall(wallSpec, mamad, houseModel.openings);
    expect(built.voids).toHaveLength(1);
    expect(built.voids[0].openingId).toBe('door_entry_mamad');
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

  it('handles two windows on one wall (living west wall) without overlap', () => {
    const living = getRoom('living')!;
    const wallSpec = living.walls.find((w) => w.id === 'living_w')!;
    const built = buildWall(wallSpec, living, houseModel.openings);
    expect(built.voids).toHaveLength(2);
    // 2 windows on one wall -> 3 solid t-strips (below/between/above are not
    // stacked since windows share the same y-range, so we expect 3 solid
    // panels: left of both, between them, right of both, each full height
    // minus the shared window band -> at least 3 render panels total.
    expect(built.renderPanels.length).toBeGreaterThanOrEqual(3);
    // No door on this wall, so it must be fully solid for collision.
    expect(built.collisionSolidSpans).toEqual([{ t0: 0, t1: built.length }]);
  });

  it('builds a solid, gapless wall for a wall with no openings', () => {
    const parents = getRoom('parents_bed')!;
    const wallSpec = parents.walls.find((w) => w.id === 'parents_s')!;
    const built = buildWall(wallSpec, parents, houseModel.openings);
    expect(built.voids).toHaveLength(0);
    expect(built.renderPanels).toHaveLength(1);
    expect(built.collisionSolidSpans).toEqual([{ t0: 0, t1: built.length }]);
  });

  it('cuts the social-terrace opening into both kitchen_s and dining_s (regression)', () => {
    // The terrace opening is 4 m wide and crosses the x=3.1 boundary between
    // kitchen_s (owned by kitchen) and dining_s (owned by dining). A single
    // opening record naming only kitchen/terrace_social was never applied to
    // dining_s (findOpeningsForWall only cuts a wall for an opening that
    // references that wall's *owning* room), leaving that portion solid
    // despite dining listing terrace_social as connected.
    const kitchen = getRoom('kitchen')!;
    const kitchenWall = kitchen.walls.find((w) => w.id === 'kitchen_s')!;
    const builtKitchen = buildWall(kitchenWall, kitchen, houseModel.openings);
    expect(builtKitchen.voids).toHaveLength(1);
    expect(builtKitchen.voids[0].openingId).toBe('exterior_opening_kitchen_terrace');

    const dining = getRoom('dining')!;
    const diningWall = dining.walls.find((w) => w.id === 'dining_s')!;
    const builtDining = buildWall(diningWall, dining, houseModel.openings);
    expect(builtDining.voids).toHaveLength(1);
    expect(builtDining.voids[0].openingId).toBe('exterior_opening_dining_terrace');
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
    // mamad_e runs from (10.8,0) to (10.8,3.0); push a point from just west
    // of it (inside mamad) toward the wall until it would clip through.
    const insideNearWall = { x: 10.8 - 0.05, z: 1.5 };
    const resolved = resolveCollision(insideNearWall, 0.28, [built]);
    // Resolved point must stay on the mamad side (x < 10.8) and be pushed
    // out by roughly thickness/2 + radius from the centerline.
    expect(resolved.x).toBeLessThan(10.8);
    expect(10.8 - resolved.x).toBeGreaterThanOrEqual(0.1 + 0.28 - 0.02);
  });

  it('cuts a walkable doorway gap into entry_hall boundary walls instead of leaving them fully open (regression)', () => {
    // entry_hall's boundaries with living and hall_south each carry a
    // specific-width open_threshold opening record, which implies a real
    // partial wall with a doorway cut — not a fully open connection (compare
    // e.g. the kitchen/dining boundary, which is genuinely open-plan and has
    // no opening record at all). A prior version of this data omitted both
    // wall segments entirely, so the openings had no wall to cut from and the
    // whole boundary rendered/collided as fully open.
    const entry = getRoom('entry_hall')!;

    const west = entry.walls.find((w) => w.id === 'entry_w')!;
    const builtWest = buildWall(west, entry, houseModel.openings);
    expect(builtWest.voids).toHaveLength(1);
    expect(builtWest.voids[0].openingId).toBe('opening_entry_living');
    expect(builtWest.doorSpans).toHaveLength(1);
    expect(builtWest.collisionSolidSpans).toHaveLength(2); // solid on both sides of the doorway gap

    const south = entry.walls.find((w) => w.id === 'entry_s')!;
    const builtSouth = buildWall(south, entry, houseModel.openings);
    expect(builtSouth.voids).toHaveLength(1);
    expect(builtSouth.voids[0].openingId).toBe('opening_entry_hallsouth');
    expect(builtSouth.doorSpans).toHaveLength(1);
    expect(builtSouth.collisionSolidSpans).toHaveLength(2);
  });

  it('cuts both bathroom doors into hs_south after its z-position moved (regression)', () => {
    // hs_south moved from z=4.0 to z=4.3 (see the comment on it in
    // house.ts), but door_hallsouth_bathmain/bathensuite were left at their
    // original z=4.0 — findOpeningsForWall only cuts an opening into a wall
    // it projects within EPS (0.05m) of, so both doors silently stopped
    // being cut at all, leaving a fully solid, collidable wall across both
    // bathroom entrances.
    const hallSouth = getRoom('hall_south')!;
    const wallSpec = hallSouth.walls.find((w) => w.id === 'hs_south')!;
    const built = buildWall(wallSpec, hallSouth, houseModel.openings);
    expect(built.voids).toHaveLength(2);
    expect(built.voids.map((v) => v.openingId).sort()).toEqual(['door_hallsouth_bathensuite', 'door_hallsouth_bathmain'].sort());
    expect(built.doorSpans).toHaveLength(2);
    expect(built.collisionSolidSpans).toHaveLength(3); // solid before, between, and after the two doorway gaps
  });

  it('pushes the player out of a structural column instead of letting them walk through it (regression)', () => {
    const column = houseModel.structuralFeatures.find((f) => f.id === 'column_living')!;
    const playerRadius = 0.28;
    const insideColumn = { x: column.position.x + 0.05, z: column.position.z };
    // No walls nearby at this point, so any push-back can only have come
    // from the column itself.
    const resolved = resolveCollision(insideColumn, playerRadius, [], houseModel.structuralFeatures);
    const distFromColumn = Math.hypot(resolved.x - column.position.x, resolved.z - column.position.z);
    expect(distFromColumn).toBeGreaterThanOrEqual(column.radiusM + playerRadius - 1e-6);
  });

  it('leaves a point far from every structural column untouched', () => {
    const farPoint = { x: 100, z: 100 };
    const resolved = resolveCollision(farPoint, 0.28, [], houseModel.structuralFeatures);
    expect(resolved).toEqual(farPoint);
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

describe('exterior room ceilings (a covered space still has a roof, an open one does not)', () => {
  it('flags the covered terrace/loggia as having a ceiling (regression)', () => {
    const terrace = getRoom('terrace_social')!;
    expect(terrace.isExterior).toBe(true);
    expect(terrace.hasCeiling).toBe(true);
  });

  it('does not flag a genuinely open-air exterior room as having a ceiling', () => {
    const approach = getRoom('stair_landing')!;
    const balcony = getRoom('balcony_service')!;
    expect(approach.isExterior).toBe(true);
    expect(approach.hasCeiling).toBeFalsy();
    expect(balcony.isExterior).toBe(true);
    expect(balcony.hasCeiling).toBeFalsy();
  });
});

describe('twin bedroom doorway (must clear the solid, protected MAMAD wall, not just overlap it) (regression)', () => {
  it('keeps mamad_e fully solid — a protected room stays sealed outside its one designated door/window', () => {
    const mamad = getRoom('mamad')!;
    const wallSpec = mamad.walls.find((w) => w.id === 'mamad_e')!;
    const built = buildWall(wallSpec, mamad, houseModel.openings);
    expect(built.voids).toHaveLength(0);
    expect(built.collisionSolidSpans).toEqual([{ t0: 0, t1: built.length }]);
  });

  it('gives the hall_south/twin_bed doorway a fully open span, entirely above mamad_e, at least as wide as the player', () => {
    const hallSouth = getRoom('hall_south')!;
    const wallSpec = hallSouth.walls.find((w) => w.id === 'hs_twin')!;
    const built = buildWall(wallSpec, hallSouth, houseModel.openings);
    // The whole hs_twin wall lies within the door's span, so it is a single,
    // fully-open gap with no residual solid collision span — none of it
    // depends on the void that mamad_e (a different room's wall) leaves.
    expect(built.collisionSolidSpans).toHaveLength(0);
    expect(built.length).toBeGreaterThanOrEqual(PLAYER_RADIUS_M * 2);
  });

  it('lets a player actually walk from hall_south into twin_bed through the doorway (regression)', () => {
    // The per-wall void span above only proves ONE wall's own 1D opening is
    // wide enough — it does not prove the doorway is walkable, because a
    // PERPENDICULAR wall meeting at the same corner (twin_s, or hall_south's
    // own hs_link_top) can have its own player-radius-expanded corner
    // overlap the opening even when every individual wall's span "looks"
    // wide enough on paper. This simulates the same per-step
    // move-then-resolveCollision loop FirstPersonControls itself runs, so it
    // actually proves a collision-free path exists rather than re-deriving
    // clearance by hand.
    let pos = { x: 10.3, z: 3.3 }; // inside hall_south's notch, just west of the doorway
    const target = { x: 12.0, z: 1.5 }; // inside twin_bed
    const STEP = 0.05;
    for (let i = 0; i < 400; i++) {
      const dx = target.x - pos.x;
      const dz = target.z - pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist < STEP) {
        pos = target;
        break;
      }
      const candidate = { x: pos.x + (dx / dist) * STEP, z: pos.z + (dz / dist) * STEP };
      pos = resolveCollision(candidate, PLAYER_RADIUS_M, builtWalls, houseModel.structuralFeatures);
    }
    expect(Math.hypot(pos.x - target.x, pos.z - target.z)).toBeLessThan(0.1);
  });
});

describe('living room spawn (must never start the player embedded inside a structural column) (regression)', () => {
  it('keeps every room camera spawn outside every column\'s collision radius', () => {
    // Entering or teleporting to a room assigns cameraSpawn directly —
    // collision resolution only runs once movement begins — so a spawn
    // inside a column+player collision radius would render the camera
    // embedded in the column until the visitor first moves.
    for (const room of houseModel.rooms) {
      for (const column of houseModel.structuralFeatures) {
        const dist = Math.hypot(room.cameraSpawn.x - column.position.x, room.cameraSpawn.z - column.position.z);
        expect(dist).toBeGreaterThanOrEqual(column.radiusM + PLAYER_RADIUS_M);
      }
    }
  });
});

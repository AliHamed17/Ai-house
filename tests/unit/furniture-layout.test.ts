import { describe, expect, it } from 'vitest';
import { furniture, furnitureForRoom, isBlocking } from '@/data/furniture';
import { houseModel, PLAYER_RADIUS_M } from '@/data/house';
import { pointInPolygon } from '@/lib/geometry/collision';
import { resolveObstacleCollision } from '@/lib/geometry/obstacleCollision';
import type { FurniturePiece } from '@/lib/furniture/types';
import type { Vec2 } from '@/lib/types';

const WALL_TOL = 0.09;
const DOOR_CLEAR = 0.9;
const rooms = houseModel.rooms;

function corners(f: FurniturePiece): Vec2[] {
  const { w, d } = f.size;
  const r = f.rotationRad ?? 0;
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  return [
    [-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2],
  ].map(([lx, lz]) => ({
    x: f.position.x + lx * cos + lz * sin,
    z: f.position.z - lx * sin + lz * cos,
  }));
}

function aabb(f: FurniturePiece) {
  const c = corners(f);
  return {
    x0: Math.min(...c.map((p) => p.x)),
    x1: Math.max(...c.map((p) => p.x)),
    z0: Math.min(...c.map((p) => p.z)),
    z1: Math.max(...c.map((p) => p.z)),
  };
}

function overlaps(a: ReturnType<typeof aabb>, b: ReturnType<typeof aabb>, slack = 0): boolean {
  return a.x0 < b.x1 - slack && a.x1 > b.x0 + slack && a.z0 < b.z1 - slack && a.z1 > b.z0 + slack;
}

function distToPolygon(pt: Vec2, poly: Vec2[]): number {
  let best = Infinity;
  for (let i = 0; i < poly.length; i += 1) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len2 = dx * dx + dz * dz;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((pt.x - a.x) * dx + (pt.z - a.z) * dz) / len2));
    best = Math.min(best, Math.hypot(pt.x - (a.x + t * dx), pt.z - (a.z + t * dz)));
  }
  return best;
}

const allWalls = rooms.flatMap((r) => r.walls);

function wallAxisAt(pos: Vec2): { ux: number; uz: number } {
  let best = { ux: 1, uz: 0 };
  let bestD = Infinity;
  for (const w of allWalls) {
    const dx = w.end.x - w.start.x;
    const dz = w.end.z - w.start.z;
    const len2 = dx * dx + dz * dz;
    if (len2 === 0) continue;
    const t = Math.max(0, Math.min(1, ((pos.x - w.start.x) * dx + (pos.z - w.start.z) * dz) / len2));
    const d = Math.hypot(pos.x - (w.start.x + t * dx), pos.z - (w.start.z + t * dz));
    if (d < bestD) {
      bestD = d;
      const len = Math.sqrt(len2);
      best = { ux: dx / len, uz: dz / len };
    }
  }
  return best;
}

/** Keep-clear zone oriented to the wall the opening sits in: wide along the
 * wall, shallow across it, so it never bleeds into the room on the far side. */
function intrudes(f: FurniturePiece, pos: Vec2, along: number, across: number): boolean {
  const { ux, uz } = wallAxisAt(pos);
  let a0 = Infinity;
  let a1 = -Infinity;
  let c0 = Infinity;
  let c1 = -Infinity;
  for (const p of corners(f)) {
    const dx = p.x - pos.x;
    const dz = p.z - pos.z;
    const a = dx * ux + dz * uz;
    const c = -dx * uz + dz * ux;
    a0 = Math.min(a0, a); a1 = Math.max(a1, a);
    c0 = Math.min(c0, c); c1 = Math.max(c1, c);
  }
  return a0 < along / 2 && a1 > -along / 2 && c0 < across / 2 && c1 > -across / 2;
}

function roomsOf(o: { roomA?: string; roomB?: string; roomId?: string }): Set<string> {
  return new Set([o.roomA, o.roomB, o.roomId].filter((r): r is string => Boolean(r) && r !== 'exterior'));
}

describe('furniture coverage', () => {
  it('furnishes every room in the house', () => {
    const empty = rooms.filter((r) => furnitureForRoom(r.id).length === 0).map((r) => r.id);
    expect(empty).toEqual([]);
  });

  it('gives every habitable room a meaningful amount of furniture', () => {
    const thin = rooms
      .filter((r) => !r.isExterior && furnitureForRoom(r.id).length < 5)
      .map((r) => `${r.id}=${furnitureForRoom(r.id).length}`);
    expect(thin).toEqual([]);
  });

  it('uses unique ids', () => {
    const ids = furniture.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('only references rooms that exist', () => {
    const known = new Set(rooms.map((r) => r.id));
    expect(furniture.filter((f) => !known.has(f.roomId)).map((f) => f.id)).toEqual([]);
  });

  it('gives every piece positive, plausible dimensions', () => {
    for (const f of furniture) {
      expect(f.size.w, f.id).toBeGreaterThan(0);
      expect(f.size.d, f.id).toBeGreaterThan(0);
      expect(f.size.h, f.id).toBeGreaterThan(0);
      expect(f.size.w, f.id).toBeLessThan(5);
      expect(f.size.d, f.id).toBeLessThan(5);
      expect((f.elevationM ?? 0) + f.size.h, f.id).toBeLessThanOrEqual(2.7);
    }
  });
});

describe('furniture placement', () => {
  it('keeps every piece inside its own room', () => {
    const stray: string[] = [];
    for (const f of furniture) {
      const room = rooms.find((r) => r.id === f.roomId)!;
      for (const c of corners(f)) {
        if (!pointInPolygon(c, room.floorPolygon) && distToPolygon(c, room.floorPolygon) > WALL_TOL) {
          stray.push(`${f.id} corner (${c.x.toFixed(2)}, ${c.z.toFixed(2)})`);
        }
      }
    }
    expect(stray).toEqual([]);
  });

  it('never puts two solid pieces in the same place', () => {
    const solid = furniture.filter(isBlocking);
    const seating = new Set(['chair', 'stool', 'bench']);
    const tuckedUnder = (a: FurniturePiece, b: FurniturePiece) =>
      (a.kind === 'table' && seating.has(b.kind)) || (b.kind === 'table' && seating.has(a.kind));
    const clashes: string[] = [];
    for (let i = 0; i < solid.length; i += 1) {
      for (let j = i + 1; j < solid.length; j += 1) {
        if (tuckedUnder(solid[i], solid[j])) continue;
        if (overlaps(aabb(solid[i]), aabb(solid[j]), 0.02)) {
          clashes.push(`${solid[i].id} <-> ${solid[j].id}`);
        }
      }
    }
    expect(clashes).toEqual([]);
  });
});

describe('furniture respects circulation', () => {
  it('leaves every doorway clear', () => {
    const blocked: string[] = [];
    for (const o of houseModel.openings) {
      if (o.kind !== 'door' && o.kind !== 'exterior_opening') continue;
      const near = roomsOf(o);
      for (const f of furniture.filter(isBlocking)) {
        if (!near.has(f.roomId)) continue;
        if (intrudes(f, o.position, Math.max(o.widthM, DOOR_CLEAR), 1.1)) {
          blocked.push(`${f.id} blocks ${o.id}`);
        }
      }
    }
    expect(blocked).toEqual([]);
  });

  it('leaves every window unobstructed by tall furniture', () => {
    const blocked: string[] = [];
    for (const o of houseModel.openings) {
      if (o.kind !== 'window') continue;
      const near = roomsOf(o);
      for (const f of furniture.filter(isBlocking)) {
        if (!near.has(f.roomId)) continue;
        const top = (f.elevationM ?? 0) + f.size.h;
        if (top > o.sillM + 0.05 && intrudes(f, o.position, Math.max(o.widthM, 0.6), 0.5)) {
          blocked.push(`${f.id} blocks ${o.id}`);
        }
      }
    }
    expect(blocked).toEqual([]);
  });

  it('leaves every room reachable — no spawn buried in furniture', () => {
    const buried: string[] = [];
    for (const room of rooms) {
      const resolved = resolveObstacleCollision(room.cameraSpawn, PLAYER_RADIUS_M);
      const moved = Math.hypot(resolved.x - room.cameraSpawn.x, resolved.z - room.cameraSpawn.z);
      if (moved > 0.001) buried.push(`${room.id} pushed ${moved.toFixed(3)} m`);
    }
    expect(buried).toEqual([]);
  });
});

describe('MAMAD regulatory clearance', () => {
  const mamadDoor = houseModel.openings.find((o) => o.id === 'door_corridor_mamad')!;
  const mamadWindow = houseModel.openings.find((o) => o.id === 'window_mamad_n')!;

  it('keeps the protected door clear on both sides', () => {
    const near = new Set(['mamad', 'corridor']);
    const intruding = furniture
      .filter((f) => near.has(f.roomId) && intrudes(f, mamadDoor.position, 1.3, 1.3))
      .map((f) => f.id);
    expect(intruding).toEqual([]);
  });

  it('keeps the blast window clear and uncovered', () => {
    const intruding = furniture
      .filter((f) => f.roomId === 'mamad' && intrudes(f, mamadWindow.position, Math.max(mamadWindow.widthM, 0.8), 0.6))
      .map((f) => f.id);
    expect(intruding).toEqual([]);
  });

  it('never curtains or panels over the protected window', () => {
    const covering = furnitureForRoom('mamad').filter(
      (f) => f.kind === 'curtain' || f.kind === 'panel' || f.kind === 'mirror',
    );
    expect(covering.map((f) => f.id)).toEqual([]);
  });
});

describe('the living/kitchen low wall', () => {
  const lowWall = houseModel.structuralFeatures.find((f) => f.id === 'lowwall_living_kitchen');

  it('exists as a low wall, 0.50 m high and 0.50 m across', () => {
    expect(lowWall, 'lowwall_living_kitchen missing').toBeDefined();
    expect(lowWall!.kind).toBe('low_wall');
    expect(lowWall!.heightM).toBeCloseTo(0.5, 3);
    expect(lowWall!.sizeM).toBeCloseTo(0.5, 3);
  });

  it('is centred on the kitchen/living transition', () => {
    const kitchen = rooms.find((r) => r.id === 'kitchen')!;
    const xs = kitchen.floorPolygon.map((p) => p.x);
    expect(lowWall!.position.x).toBeCloseTo((Math.min(...xs) + Math.max(...xs)) / 2, 2);
    expect(lowWall!.position.z).toBeCloseTo(5.35, 2);
  });

  it('is solid to the walker', () => {
    const infront = { x: lowWall!.position.x, z: lowWall!.position.z - 0.05 };
    const resolved = resolveObstacleCollision(infront, PLAYER_RADIUS_M);
    expect(Math.hypot(resolved.x - infront.x, resolved.z - infront.z)).toBeGreaterThan(0.05);
  });
});

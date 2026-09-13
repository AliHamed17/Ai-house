import { describe, expect, it } from 'vitest';
import { CEILING_HEIGHT_M, houseModel } from '@/data/house';
import { pointInPolygon } from '@/lib/geometry/collision';
import type { RoomDef, RoomId, Vec2 } from '@/lib/types';

const EPS = 1e-6;
const TOL = 0.005;

const rooms = houseModel.rooms;
const enclosed = rooms.filter((r) => !r.isExterior);

function area(poly: Vec2[]): number {
  let a = 0;
  for (let i = 0; i < poly.length; i += 1) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    a += p.x * q.z - q.x * p.z;
  }
  return a / 2;
}

function bbox(poly: Vec2[]) {
  return {
    x0: Math.min(...poly.map((p) => p.x)),
    x1: Math.max(...poly.map((p) => p.x)),
    z0: Math.min(...poly.map((p) => p.z)),
    z1: Math.max(...poly.map((p) => p.z)),
  };
}

function segmentsProperlyCross(a: Vec2, b: Vec2, c: Vec2, d: Vec2): boolean {
  const cross = (o: Vec2, p: Vec2, q: Vec2) => (p.x - o.x) * (q.z - o.z) - (p.z - o.z) * (q.x - o.x);
  const d1 = cross(a, b, c);
  const d2 = cross(a, b, d);
  const d3 = cross(c, d, a);
  const d4 = cross(c, d, b);
  return ((d1 > EPS && d2 < -EPS) || (d1 < -EPS && d2 > EPS))
    && ((d3 > EPS && d4 < -EPS) || (d3 < -EPS && d4 > EPS));
}

function collinearOverlap(a: Vec2, b: Vec2, c: Vec2, d: Vec2): number {
  const abx = b.x - a.x;
  const abz = b.z - a.z;
  const len = Math.hypot(abx, abz);
  if (len < EPS) return 0;
  const ux = abx / len;
  const uz = abz / len;
  const perp = (p: Vec2) => Math.abs((p.x - a.x) * uz - (p.z - a.z) * ux);
  if (perp(c) > TOL || perp(d) > TOL) return 0;
  const proj = (p: Vec2) => (p.x - a.x) * ux + (p.z - a.z) * uz;
  const t0 = Math.max(0, Math.min(proj(c), proj(d)));
  const t1 = Math.min(len, Math.max(proj(c), proj(d)));
  return Math.max(0, t1 - t0);
}

function sharedBoundaryLength(a: RoomDef, b: RoomDef): number {
  let total = 0;
  for (let i = 0; i < a.floorPolygon.length; i += 1) {
    const p = a.floorPolygon[i];
    const q = a.floorPolygon[(i + 1) % a.floorPolygon.length];
    for (let j = 0; j < b.floorPolygon.length; j += 1) {
      const r = b.floorPolygon[j];
      const s = b.floorPolygon[(j + 1) % b.floorPolygon.length];
      total += collinearOverlap(p, q, r, s);
    }
  }
  return total;
}

describe('house footprint', () => {
  it('encloses exactly the 15.00 x 8.72 m bar the plan dimension chains close to', () => {
    const xs = enclosed.flatMap((r) => r.floorPolygon.map((p) => p.x));
    const zs = enclosed.flatMap((r) => r.floorPolygon.map((p) => p.z));
    expect(Math.min(...xs)).toBeCloseTo(0, 2);
    expect(Math.max(...xs)).toBeCloseTo(15.0, 2);
    expect(Math.min(...zs)).toBeCloseTo(0, 2);
    expect(Math.max(...zs)).toBeCloseTo(8.72, 2);
  });

  it('is a wide east-west bar, not a square', () => {
    const xs = enclosed.flatMap((r) => r.floorPolygon.map((p) => p.x));
    const zs = enclosed.flatMap((r) => r.floorPolygon.map((p) => p.z));
    const aspect = (Math.max(...xs) - Math.min(...xs)) / (Math.max(...zs) - Math.min(...zs));
    expect(aspect).toBeGreaterThan(1.6);
  });
});

describe('room polygons', () => {
  it('gives every room at least three vertices and a non-trivial area', () => {
    for (const r of rooms) {
      expect(r.floorPolygon.length, r.id).toBeGreaterThanOrEqual(3);
      expect(Math.abs(area(r.floorPolygon)), r.id).toBeGreaterThan(0.5);
    }
  });

  it('winds every polygon consistently', () => {
    const signs = new Set(rooms.map((r) => Math.sign(area(r.floorPolygon))));
    expect(signs.size).toBe(1);
  });

  it('never lets a polygon cross itself', () => {
    for (const r of rooms) {
      const poly = r.floorPolygon;
      const n = poly.length;
      for (let i = 0; i < n; i += 1) {
        for (let j = i + 2; j < n; j += 1) {
          if (i === 0 && j === n - 1) continue;
          const cross = segmentsProperlyCross(
            poly[i], poly[(i + 1) % n], poly[j], poly[(j + 1) % n],
          );
          expect(cross, `${r.id} edge ${i} crosses edge ${j}`).toBe(false);
        }
      }
    }
  });

  it('never overlaps two rooms', () => {
    const step = 0.1;
    const collisions: string[] = [];
    for (const [i, a] of rooms.entries()) {
      const bb = bbox(a.floorPolygon);
      for (let x = bb.x0 + step / 2; x < bb.x1; x += step) {
        for (let z = bb.z0 + step / 2; z < bb.z1; z += step) {
          const pt = { x, z };
          if (!pointInPolygon(pt, a.floorPolygon)) continue;
          for (const b of rooms.slice(i + 1)) {
            if (pointInPolygon(pt, b.floorPolygon)) {
              collisions.push(`${a.id} overlaps ${b.id}`);
            }
          }
        }
      }
    }
    expect([...new Set(collisions)]).toEqual([]);
  });
});

describe('room adjacency', () => {
  it('declares every connection from both sides', () => {
    const asymmetric: string[] = [];
    for (const a of rooms) {
      for (const id of a.connectedRoomIds) {
        const b = rooms.find((r) => r.id === id);
        if (!b) {
          asymmetric.push(`${a.id} -> ${id} (no such room)`);
        } else if (!b.connectedRoomIds.includes(a.id)) {
          asymmetric.push(`${a.id} -> ${id} but not back`);
        }
      }
    }
    expect(asymmetric).toEqual([]);
  });

  it('only connects rooms that physically share a wall', () => {
    const detached: string[] = [];
    for (const a of rooms) {
      for (const id of a.connectedRoomIds) {
        const b = rooms.find((r) => r.id === id);
        if (!b) continue;
        const shared = sharedBoundaryLength(a, b);
        if (shared < 0.6) {
          detached.push(`${a.id} <-> ${id} shares only ${shared.toFixed(3)} m`);
        }
      }
    }
    expect(detached).toEqual([]);
  });

  it('leaves every room reachable from the entry', () => {
    const seen = new Set<string>(['stair_landing']);
    const queue = ['stair_landing'];
    while (queue.length) {
      const id0 = queue.shift()!;
      const cur = rooms.find((r) => r.id === id0)!;
      for (const id of cur.connectedRoomIds) {
        if (!seen.has(id)) {
          seen.add(id);
          queue.push(id);
        }
      }
    }
    expect(rooms.filter((r) => !seen.has(r.id)).map((r) => r.id)).toEqual([]);
  });
});

describe('openings', () => {
  it('places every opening on a wall owned by one of its rooms', () => {
    const orphans: string[] = [];
    for (const o of houseModel.openings) {
      if (o.kind === 'open_threshold') continue;
      const ids = [o.roomA, o.roomB, o.roomId].filter(
        (id): id is RoomId => Boolean(id) && id !== 'exterior',
      );
      const unknown = ids.filter((id) => !rooms.some((r) => r.id === id));
      if (unknown.length) {
        orphans.push(`${o.id} references unknown room(s) ${unknown.join(', ')}`);
        continue;
      }
      const hosted = ids.some((id) => {
        const room = rooms.find((r) => r.id === id)!;
        return room.walls.some((w) => {
          const len = Math.hypot(w.end.x - w.start.x, w.end.z - w.start.z);
          if (len < EPS) return false;
          const ux = (w.end.x - w.start.x) / len;
          const uz = (w.end.z - w.start.z) / len;
          const dx = o.position.x - w.start.x;
          const dz = o.position.z - w.start.z;
          const along = dx * ux + dz * uz;
          const off = Math.abs(dx * uz - dz * ux);
          return off < 0.06 && along > -0.06 && along < len + 0.06;
        });
      });
      if (!hosted) orphans.push(`${o.id} sits on no wall of ${ids.join(' or ')}`);
    }
    expect(orphans).toEqual([]);
  });

  it('keeps the MAMAD protected and single-doored', () => {
    const mamadDoors = houseModel.openings.filter(
      (o) => o.kind === 'door' && (o.roomA === 'mamad' || o.roomB === 'mamad'),
    );
    expect(mamadDoors).toHaveLength(1);
    expect(mamadDoors[0].isProtected).toBe(true);
    const mamadWindows = houseModel.openings.filter(
      (o) => o.kind === 'window' && o.roomId === 'mamad',
    );
    expect(mamadWindows).toHaveLength(1);
    expect(mamadWindows[0].isProtected).toBe(true);
  });
});

describe('structural columns', () => {
  it('places every column inside the building envelope', () => {
    const stray = houseModel.structuralFeatures.filter((f) => {
      const { x, z } = f.position;
      return x < -0.4 || x > 15.4 || z < -1.4 || z > 11.5;
    });
    expect(stray.map((f) => f.id)).toEqual([]);
  });

  it('carries the piers the walkthrough shows, not a single invented one', () => {
    expect(houseModel.structuralFeatures.length).toBeGreaterThanOrEqual(8);
  });

  it('models the living/kitchen divider as a 0.50 m high, 0.50 m wide low wall', () => {
    const lw = houseModel.structuralFeatures.find((f) => f.id === 'lowwall_living_kitchen');
    expect(lw, 'lowwall_living_kitchen missing').toBeDefined();
    expect(lw!.kind).toBe('low_wall');
    expect(lw!.sizeM).toBeCloseTo(0.5, 3);
    expect(lw!.heightM).toBeCloseTo(0.5, 3);
    expect(lw!.heightM).toBeLessThan(CEILING_HEIGHT_M);
    expect(lw!.position.z).toBeCloseTo(5.35, 2);
  });

  it('leaves the rest of the living/kitchen boundary genuinely open', () => {
    const divider = houseModel.openings.find((o) => o.id === 'opening_living_kitchen');
    expect(divider?.kind).toBe('open_threshold');
    const living = rooms.find((r) => r.id === 'living')!;
    const solidOnBoundary = living.walls.filter((w) => Math.abs(w.start.z - 5.35) < 0.01 && Math.abs(w.end.z - 5.35) < 0.01);
    const solidLength = solidOnBoundary.reduce((n, w) => n + Math.abs(w.end.x - w.start.x), 0);
    expect(solidLength).toBeLessThanOrEqual(0.55);
  });
});

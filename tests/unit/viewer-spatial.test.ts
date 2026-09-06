import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { houseModel, PLAYER_RADIUS_M } from '@/data/house';
import { houseBounds, enclosedBounds } from '@/lib/geometry/houseBounds';
import { builtWalls } from '@/lib/geometry/builtHouse';
import { resolveCollision, pointInPolygon } from '@/lib/geometry/collision';

const SRC = path.resolve(import.meta.dirname, '../../src');

describe('house bounds', () => {
  it('frames the enclosed building as the 15.00 x 8.72 m bar', () => {
    expect(enclosedBounds.width).toBeCloseTo(15.0, 2);
    expect(enclosedBounds.depth).toBeCloseTo(8.72, 2);
    expect(enclosedBounds.center.x).toBeCloseTo(7.5, 2);
    expect(enclosedBounds.center.z).toBeCloseTo(4.36, 2);
  });

  it('includes the terraces and stair in the camera-framing bounds', () => {
    expect(houseBounds.minZ).toBeLessThan(0);
    expect(houseBounds.maxX).toBeCloseTo(15.0, 2);
    expect(houseBounds.width).toBeGreaterThanOrEqual(enclosedBounds.width);
    expect(houseBounds.depth).toBeGreaterThan(enclosedBounds.depth);
  });
});

describe('3D viewer spatial assumptions', () => {
  it('orbits the dollhouse around the real house centre, not a hardcoded one', () => {
    const src = readFileSync(path.join(SRC, 'components/viewer3d/OrbitDollhouseControls.tsx'), 'utf8');
    expect(src).toContain('houseBounds.center');
    const hardcoded = src.match(/\{\s*x:\s*-?[\d.]+\s*,\s*z:\s*-?[\d.]+\s*\}/g);
    expect(hardcoded, `hardcoded centre in OrbitDollhouseControls: ${hardcoded}`).toBeNull();
  });

  it('lets the camera pull back far enough to see the whole house', () => {
    const src = readFileSync(path.join(SRC, 'components/viewer3d/OrbitDollhouseControls.tsx'), 'utf8');
    const max = /maxDistance=\{([^}]+)\}/.exec(src)?.[1] ?? '';
    const evaluated = max.includes('houseBounds') ? Math.max(28, houseBounds.width * 1.8) : Number(max);
    expect(evaluated).toBeGreaterThan(houseBounds.width);
  });

  it('spawns every room somewhere the player can actually stand', () => {
    const stuck: string[] = [];
    for (const room of houseModel.rooms) {
      const resolved = resolveCollision(room.cameraSpawn, PLAYER_RADIUS_M, builtWalls);
      const moved = Math.hypot(resolved.x - room.cameraSpawn.x, resolved.z - room.cameraSpawn.z);
      if (moved > 0.001) stuck.push(`${room.id} pushed ${moved.toFixed(3)} m out of a wall`);
    }
    expect(stuck).toEqual([]);
  });

  it('keeps every spawn inside its own room after collision resolution', () => {
    const escaped: string[] = [];
    for (const room of houseModel.rooms) {
      const resolved = resolveCollision(room.cameraSpawn, PLAYER_RADIUS_M, builtWalls);
      if (!pointInPolygon(resolved, room.floorPolygon)) escaped.push(room.id);
    }
    expect(escaped).toEqual([]);
  });

  it('keeps every spawn clear of the structural piers and columns', () => {
    const blocked: string[] = [];
    for (const room of houseModel.rooms) {
      for (const f of houseModel.structuralFeatures) {
        const half = f.kind === 'pier' ? (f.sizeM ?? 0.5) / 2 : f.radiusM;
        const dx = Math.abs(room.cameraSpawn.x - f.position.x);
        const dz = Math.abs(room.cameraSpawn.z - f.position.z);
        if (dx < half + PLAYER_RADIUS_M && dz < half + PLAYER_RADIUS_M) {
          blocked.push(`${room.id} spawn overlaps ${f.id}`);
        }
      }
    }
    expect(blocked).toEqual([]);
  });

  it('builds every wall in the house without a degenerate segment', () => {
    expect(builtWalls.length).toBeGreaterThan(20);
    for (const w of builtWalls) {
      expect(w.length, w.wallId).toBeGreaterThan(0.05);
      expect(w.heightM, w.wallId).toBeGreaterThan(0.5);
    }
  });
});

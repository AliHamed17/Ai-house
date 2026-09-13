/**
 * Circle-vs-wall collision for the first-person walk controller.
 *
 * Each wall's floor-level solid spans (see wallPanels.ts) are treated as an
 * oriented rectangle in the wall's local (t = along wall, n = perpendicular)
 * frame, expanded by the player's radius (a Minkowski sum). If the player's
 * local position falls inside an expanded rectangle, we push them out along
 * whichever axis has the smallest penetration — this naturally slides the
 * player along a wall face and also blocks them cleanly at a doorframe edge.
 */

import type { StructuralFeature, Vec2 } from '@/lib/types';
import type { BuiltWall } from './wallPanels';

function toLocal(pos: Vec2, wall: BuiltWall) {
  const dx = pos.x - wall.start.x;
  const dz = pos.z - wall.start.z;
  const t = dx * wall.ux + dz * wall.uz;
  const n = -dx * wall.uz + dz * wall.ux;
  return { t, n };
}

function toWorld(t: number, n: number, wall: BuiltWall): Vec2 {
  return {
    x: wall.start.x + t * wall.ux - n * wall.uz,
    z: wall.start.z + t * wall.uz + n * wall.ux,
  };
}

export function resolveCollision(pos: Vec2, radiusM: number, walls: BuiltWall[], columns: StructuralFeature[] = []): Vec2 {
  let p: Vec2 = { x: pos.x, z: pos.z };
  const ITERATIONS = 3;

  for (let iter = 0; iter < ITERATIONS; iter++) {
    for (const wall of walls) {
      const halfN = wall.thicknessM / 2 + radiusM;
      const { t, n } = toLocal(p, wall);
      if (n <= -halfN || n >= halfN) continue;

      for (const span of wall.collisionSolidSpans) {
        const t0 = span.t0 - radiusM;
        const t1 = span.t1 + radiusM;
        if (t <= t0 || t >= t1) continue;

        const penLeft = t - t0;
        const penRight = t1 - t;
        const penBottom = n - -halfN;
        const penTop = halfN - n;
        const minPen = Math.min(penLeft, penRight, penBottom, penTop);

        let newT = t;
        let newN = n;
        if (minPen === penBottom) newN = -halfN;
        else if (minPen === penTop) newN = halfN;
        else if (minPen === penLeft) newT = t0;
        else newT = t1;

        const world = toWorld(newT, newN, wall);
        p = world;
      }
    }

    // Columns are simple floor-to-ceiling cylinders, so (unlike a wall's
    // rectangular void sweep) a plain circle-vs-circle push-out is enough.
    for (const column of columns) {
      const dx = p.x - column.position.x;
      const dz = p.z - column.position.z;
      const dist = Math.hypot(dx, dz);
      const minDist = radiusM + column.radiusM;
      if (dist >= minDist) continue;
      if (dist < 1e-6) {
        // Degenerate (exactly at the column's center): push a fixed
        // direction rather than dividing by a zero-length vector.
        p = { x: column.position.x + minDist, z: column.position.z };
        continue;
      }
      const scale = minDist / dist;
      p = { x: column.position.x + dx * scale, z: column.position.z + dz * scale };
    }
  }

  return p;
}

/** Which room (if any) contains this world-space point, using ray casting. */
export function pointInPolygon(point: Vec2, polygon: Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x;
    const zi = polygon[i].z;
    const xj = polygon[j].x;
    const zj = polygon[j].z;
    const intersects = zi > point.z !== zj > point.z && point.x < ((xj - xi) * (point.z - zi)) / (zj - zi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

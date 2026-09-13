import { houseModel } from '@/data/house';
import { furniture, isBlocking } from '@/data/furniture';
import type { Vec2 } from '@/lib/types';

export interface Obstacle {
  id: string;
  cx: number;
  cz: number;
  halfW: number;
  halfD: number;
  rot: number;
  radius?: number;
}

function boxObstacle(id: string, cx: number, cz: number, w: number, d: number, rot: number): Obstacle {
  return { id, cx, cz, halfW: w / 2, halfD: d / 2, rot };
}

export const obstacles: Obstacle[] = [
  ...furniture
    .filter(isBlocking)
    .map((f) => boxObstacle(f.id, f.position.x, f.position.z, f.size.w, f.size.d, f.rotationRad ?? 0)),
  ...houseModel.structuralFeatures.map((f) => {
    if (f.kind === 'column') {
      return { id: f.id, cx: f.position.x, cz: f.position.z, halfW: f.radiusM, halfD: f.radiusM, rot: 0, radius: f.radiusM };
    }
    const w = f.sizeM ?? 0.5;
    const d = f.kind === 'low_wall' ? (f.thicknessM ?? 0.2) : w;
    return boxObstacle(f.id, f.position.x, f.position.z, w, d, f.rotationRad ?? 0);
  }),
];

/** Circle-vs-oriented-box push-out, mirroring the wall solver's behaviour so
 * the player slides along furniture instead of sticking to it. */
export function resolveObstacleCollision(pos: Vec2, radiusM: number, list: Obstacle[] = obstacles): Vec2 {
  let p: Vec2 = { x: pos.x, z: pos.z };

  for (let iter = 0; iter < 2; iter += 1) {
    for (const o of list) {
      if (o.radius !== undefined) {
        const dx = p.x - o.cx;
        const dz = p.z - o.cz;
        const dist = Math.hypot(dx, dz);
        const min = o.radius + radiusM;
        if (dist >= min) continue;
        if (dist < 1e-6) {
          p = { x: o.cx + min, z: o.cz };
        } else {
          p = { x: o.cx + (dx / dist) * min, z: o.cz + (dz / dist) * min };
        }
        continue;
      }

      const cos = Math.cos(-o.rot);
      const sin = Math.sin(-o.rot);
      const dx = p.x - o.cx;
      const dz = p.z - o.cz;
      const lx = dx * cos - dz * sin;
      const lz = dx * sin + dz * cos;

      const ex = o.halfW + radiusM;
      const ez = o.halfD + radiusM;
      if (lx <= -ex || lx >= ex || lz <= -ez || lz >= ez) continue;

      const penLeft = lx + ex;
      const penRight = ex - lx;
      const penBack = lz + ez;
      const penFront = ez - lz;
      const minPen = Math.min(penLeft, penRight, penBack, penFront);

      let nx = lx;
      let nz = lz;
      if (minPen === penLeft) nx = -ex;
      else if (minPen === penRight) nx = ex;
      else if (minPen === penBack) nz = -ez;
      else nz = ez;

      const bcos = Math.cos(o.rot);
      const bsin = Math.sin(o.rot);
      p = { x: o.cx + nx * bcos - nz * bsin, z: o.cz + nx * bsin + nz * bcos };
    }
  }

  return p;
}

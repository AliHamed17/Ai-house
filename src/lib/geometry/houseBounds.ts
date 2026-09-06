import { houseModel } from '@/data/house';
import type { Vec2 } from '@/lib/types';

export interface HouseBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  width: number;
  depth: number;
  center: Vec2;
}

function boundsOf(polygons: Vec2[][]): HouseBounds {
  const xs = polygons.flat().map((p) => p.x);
  const zs = polygons.flat().map((p) => p.z);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minZ = Math.min(...zs);
  const maxZ = Math.max(...zs);
  return {
    minX,
    maxX,
    minZ,
    maxZ,
    width: maxX - minX,
    depth: maxZ - minZ,
    center: { x: (minX + maxX) / 2, z: (minZ + maxZ) / 2 },
  };
}

/** Everything the camera should be able to frame, terraces and stair included. */
export const houseBounds: HouseBounds = boundsOf(houseModel.rooms.map((r) => r.floorPolygon));

/** The enclosed building only — the 15.00 x 8.72 m bar. */
export const enclosedBounds: HouseBounds = boundsOf(
  houseModel.rooms.filter((r) => !r.isExterior).map((r) => r.floorPolygon),
);

/**
 * The house's wall geometry is static, derived deterministically from
 * src/data/house.ts. Building it once at module load (rather than per
 * component render) avoids redoing the wall-panel sweep on every mount and
 * lets both rendering (HouseGeometry) and collision (FirstPersonControls)
 * share one array.
 */

import { houseModel } from '@/data/house';
import { buildAllWalls, type BuiltWall } from './wallPanels';

export const builtWalls: BuiltWall[] = buildAllWalls(houseModel.rooms, houseModel.openings);

export function wallsForRoom(roomId: string): BuiltWall[] {
  return builtWalls.filter((w) => w.roomId === roomId);
}

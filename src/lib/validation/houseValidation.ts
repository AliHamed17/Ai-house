/**
 * Structural validation for the authored house model. Used by the unit
 * tests (tests/unit/house-validation.test.ts) and safe to import from
 * anywhere since it has no side effects.
 */

import type { FurnitureItem, HouseModel, RoomId, Vec2 } from '@/lib/types';
import { buildAllWalls } from '@/lib/geometry/wallPanels';

export function findDuplicateRoomIds(house: HouseModel): RoomId[] {
  const seen = new Set<RoomId>();
  const dupes = new Set<RoomId>();
  for (const room of house.rooms) {
    if (seen.has(room.id)) dupes.add(room.id);
    seen.add(room.id);
  }
  return Array.from(dupes);
}

/** Adjacency is authored per-room but should be symmetric; this returns any one-directional edges. */
export function findAsymmetricAdjacency(house: HouseModel): { from: RoomId; to: RoomId }[] {
  const byId = new Map(house.rooms.map((r) => [r.id, r]));
  const problems: { from: RoomId; to: RoomId }[] = [];
  for (const room of house.rooms) {
    for (const neighborId of room.connectedRoomIds) {
      const neighbor = byId.get(neighborId);
      if (!neighbor) {
        problems.push({ from: room.id, to: neighborId });
        continue;
      }
      if (!neighbor.connectedRoomIds.includes(room.id)) {
        problems.push({ from: room.id, to: neighborId });
      }
    }
  }
  return problems;
}

export function reachableRoomIds(house: HouseModel, startId: RoomId): Set<RoomId> {
  const byId = new Map(house.rooms.map((r) => [r.id, r]));
  const visited = new Set<RoomId>();
  const queue: RoomId[] = [startId];
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (visited.has(current)) continue;
    visited.add(current);
    const room = byId.get(current);
    if (!room) continue;
    for (const neighborId of room.connectedRoomIds) {
      if (!visited.has(neighborId)) queue.push(neighborId);
    }
  }
  return visited;
}

export function findUnreachableRooms(house: HouseModel, startId: RoomId): RoomId[] {
  const reachable = reachableRoomIds(house, startId);
  return house.rooms.map((r) => r.id).filter((id) => !reachable.has(id));
}

export function findNonPositiveDimensions(house: HouseModel): RoomId[] {
  return house.rooms
    .filter((r) => !(r.dimensions.widthM > 0 && r.dimensions.depthM > 0) || !(r.ceilingHeightM > 0))
    .map((r) => r.id);
}

export function findRoomsMissingConfidenceOrSource(house: HouseModel): RoomId[] {
  return house.rooms.filter((r) => !r.confidence || !r.dimensionSource).map((r) => r.id);
}

export interface MamadCheck {
  ok: boolean;
  errors: string[];
}

/** MAMAD must be protected, have exactly one protected door, and exactly one protected window. */
export function validateMamadProtected(house: HouseModel): MamadCheck {
  const errors: string[] = [];
  const mamad = house.rooms.find((r) => r.id === 'mamad');
  if (!mamad) {
    errors.push('mamad room is missing from the house model');
    return { ok: false, errors };
  }
  if (!mamad.isProtected) errors.push('mamad room must have isProtected = true');

  const protectedDoors = house.openings.filter(
    (o) => o.kind === 'door' && o.isProtected && (o.roomA === 'mamad' || o.roomB === 'mamad'),
  );
  if (protectedDoors.length !== 1) {
    errors.push(`mamad must have exactly one protected door, found ${protectedDoors.length}`);
  }

  const anyOtherDoors = house.openings.filter(
    (o) => o.kind === 'door' && !o.isProtected && (o.roomA === 'mamad' || o.roomB === 'mamad'),
  );
  if (anyOtherDoors.length > 0) {
    errors.push('mamad has an unprotected door in addition to its protected door');
  }

  const protectedWindows = house.openings.filter((o) => o.kind === 'window' && o.isProtected && o.roomId === 'mamad');
  if (protectedWindows.length !== 1) {
    errors.push(`mamad must have exactly one protected window, found ${protectedWindows.length}`);
  }

  return { ok: errors.length === 0, errors };
}

export interface HouseValidationReport {
  ok: boolean;
  duplicateRoomIds: RoomId[];
  asymmetricAdjacency: { from: RoomId; to: RoomId }[];
  unreachableRooms: RoomId[];
  nonPositiveDimensionRooms: RoomId[];
  roomsMissingMetadata: RoomId[];
  mamad: MamadCheck;
}

// ---------------------------------------------------------------------------
// Furniture validation
// ---------------------------------------------------------------------------

const MAMAD_CLEARANCE_M = 0.9;
const MAMAD_MARGIN_M = 0.15;

function pointInPolygon(point: Vec2, polygon: Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x;
    const zi = polygon[i].z;
    const xj = polygon[j].x;
    const zj = polygon[j].z;
    const intersect = zi > point.z !== zj > point.z && point.x < ((xj - xi) * (point.z - zi)) / (zj - zi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/** World-space corners of a furniture item's footprint, using the same
 * local-axis/rotation convention as wall panels (see wallPanels.ts): local
 * +x = footprintM.widthM, local +z = footprintM.depthM. */
function furnitureWorldCorners(item: FurnitureItem): Vec2[] {
  const hw = item.footprintM.widthM / 2;
  const hd = item.footprintM.depthM / 2;
  const local: Vec2[] = [
    { x: -hw, z: -hd },
    { x: hw, z: -hd },
    { x: hw, z: hd },
    { x: -hw, z: hd },
  ];
  const cos = Math.cos(item.rotationYRad);
  const sin = Math.sin(item.rotationYRad);
  return local.map((p) => ({
    x: p.x * cos + p.z * sin + item.position.x,
    z: -p.x * sin + p.z * cos + item.position.z,
  }));
}

/** Every furniture item's footprint must sit fully inside its own room's floor polygon. */
export function findFurnitureOutsidePolygon(house: HouseModel, items: FurnitureItem[]): string[] {
  const roomsById = new Map(house.rooms.map((r) => [r.id, r]));
  const bad: string[] = [];
  for (const item of items) {
    const room = roomsById.get(item.roomId);
    if (!room || !furnitureWorldCorners(item).every((c) => pointInPolygon(c, room.floorPolygon))) {
      bad.push(item.id);
    }
  }
  return bad;
}

interface KeepOutBox {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

function aabbOverlaps(a: KeepOutBox, b: KeepOutBox): boolean {
  return !(a.maxX <= b.minX || b.maxX <= a.minX || a.maxZ <= b.minZ || b.maxZ <= a.minZ);
}

/** World-space floor clearance boxes in front of every protected door/window
 * in a room — computed from the same void data wallPanels.ts uses to cut
 * openings, not a separately-authored approximation. */
function protectedKeepOutBoxes(house: HouseModel, roomId: RoomId): KeepOutBox[] {
  const room = house.rooms.find((r) => r.id === roomId);
  if (!room) return [];
  const n = room.floorPolygon.length;
  const centroid = room.floorPolygon.reduce((acc, p) => ({ x: acc.x + p.x / n, z: acc.z + p.z / n }), { x: 0, z: 0 });
  const walls = buildAllWalls(house.rooms, house.openings).filter((w) => w.roomId === roomId);
  const boxes: KeepOutBox[] = [];
  for (const wall of walls) {
    for (const v of wall.voids) {
      if (!v.isProtected) continue;
      const t0 = v.t0 - MAMAD_MARGIN_M;
      const t1 = v.t1 + MAMAD_MARGIN_M;
      const ax = wall.start.x + wall.ux * t0;
      const az = wall.start.z + wall.uz * t0;
      const bx = wall.start.x + wall.ux * t1;
      const bz = wall.start.z + wall.uz * t1;
      // Perpendicular to the wall tangent; sign chosen so it points into the room.
      const nx = -wall.uz;
      const nz = wall.ux;
      const towardCenter = (centroid.x - wall.start.x) * nx + (centroid.z - wall.start.z) * nz;
      const sign = towardCenter >= 0 ? 1 : -1;
      const dx = nx * sign * MAMAD_CLEARANCE_M;
      const dz = nz * sign * MAMAD_CLEARANCE_M;
      const xs = [ax, bx, ax + dx, bx + dx];
      const zs = [az, bz, az + dz, bz + dz];
      boxes.push({ minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs) });
    }
  }
  return boxes;
}

/** Furniture placed in MAMAD must never sit inside its protected door or
 * window's floor clearance — checked geometrically against the real
 * opening/void data, not just by authoring convention. */
export function findMamadFurnitureObstructions(house: HouseModel, items: FurnitureItem[]): string[] {
  const keepouts = protectedKeepOutBoxes(house, 'mamad');
  if (keepouts.length === 0) return [];
  const bad: string[] = [];
  for (const item of items.filter((i) => i.roomId === 'mamad')) {
    const corners = furnitureWorldCorners(item);
    const xs = corners.map((c) => c.x);
    const zs = corners.map((c) => c.z);
    const itemBox: KeepOutBox = { minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs) };
    if (keepouts.some((k) => aabbOverlaps(itemBox, k))) bad.push(item.id);
  }
  return bad;
}

/** Every furniture item must carry a real shop link — the entire point of the feature. */
export function findFurnitureMissingShopLink(items: FurnitureItem[]): string[] {
  return items.filter((i) => !i.productUrl?.trim() || !i.retailer?.trim() || !i.shopLabel?.trim()).map((i) => i.id);
}

export function validateHouse(house: HouseModel, entryRoomId: RoomId): HouseValidationReport {
  const duplicateRoomIds = findDuplicateRoomIds(house);
  const asymmetricAdjacency = findAsymmetricAdjacency(house);
  const unreachableRooms = findUnreachableRooms(house, entryRoomId);
  const nonPositiveDimensionRooms = findNonPositiveDimensions(house);
  const roomsMissingMetadata = findRoomsMissingConfidenceOrSource(house);
  const mamad = validateMamadProtected(house);

  const ok =
    duplicateRoomIds.length === 0 &&
    asymmetricAdjacency.length === 0 &&
    unreachableRooms.length === 0 &&
    nonPositiveDimensionRooms.length === 0 &&
    roomsMissingMetadata.length === 0 &&
    mamad.ok;

  return { ok, duplicateRoomIds, asymmetricAdjacency, unreachableRooms, nonPositiveDimensionRooms, roomsMissingMetadata, mamad };
}

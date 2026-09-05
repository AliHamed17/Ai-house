/**
 * Structural validation for the authored house model. Used by the unit
 * tests (tests/unit/house-validation.test.ts) and safe to import from
 * anywhere since it has no side effects.
 */

import type { HouseModel, RoomId } from '@/lib/types';

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

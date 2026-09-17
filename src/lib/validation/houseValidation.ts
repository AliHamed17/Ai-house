/**
 * Structural validation for the authored house model. Used by the unit
 * tests (tests/unit/house-validation.test.ts) and safe to import from
 * anywhere since it has no side effects.
 */

import type { FurnitureItem, HouseModel, OpeningKind, RoomId, Vec2 } from '@/lib/types';
import { buildAllWalls } from '@/lib/geometry/wallPanels';
import { EYE_HEIGHT_M } from '@/data/house';

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

function boundingBox(corners: Vec2[]): KeepOutBox {
  const xs = corners.map((c) => c.x);
  const zs = corners.map((c) => c.z);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs) };
}

/** Height below which a visitor simply steps over something (a rug, a
 *  threshold strip) rather than being blocked by it. */
const STEP_OVER_M = 0.1;

/** Vertical span a standing visitor actually occupies: from step-over height
 *  up to eye level. An item entirely below it is walked over; an item
 *  entirely above it is walked under. Only items overlapping this band can
 *  trap the camera. */
function occupiesWalkingVolume(item: FurnitureItem): boolean {
  const bottom = item.mountYM ?? 0;
  const top = bottom + item.heightM;
  return top > STEP_OVER_M && bottom < EYE_HEIGHT_M;
}

/** Furniture is not included in collision resolution (see resolveCollision in
 * collision.ts), so a standing piece placed directly on a room's authored
 * cameraSpawn would spawn the visitor looking like they're standing inside
 * it, with nothing to correct that on entry. Only items that actually
 * occupy the standing visitor's vertical band count: a floor covering is
 * stepped over and wall- or ceiling-hung joinery is walked under, so
 * neither can trap a camera fixed at EYE_HEIGHT_M. */
export function findFurnitureBlockingCameraSpawn(house: HouseModel, items: FurnitureItem[]): string[] {
  const roomsById = new Map(house.rooms.map((r) => [r.id, r]));
  const bad: string[] = [];
  for (const item of items) {
    if (!occupiesWalkingVolume(item)) continue;
    const room = roomsById.get(item.roomId);
    if (!room) continue;
    const box = boundingBox(furnitureWorldCorners(item));
    const { x, z } = room.cameraSpawn;
    if (x >= box.minX && x <= box.maxX && z >= box.minZ && z <= box.maxZ) bad.push(item.id);
  }
  return bad;
}

function aabbOverlaps(a: KeepOutBox, b: KeepOutBox): boolean {
  return !(a.maxX <= b.minX || b.maxX <= a.minX || a.maxZ <= b.minZ || b.maxZ <= a.minZ);
}

/** World-space floor clearance boxes in front of every protected door/window
 * in a room — computed from the same void data wallPanels.ts uses to cut
 * openings, not a separately-authored approximation. */
/** Average of a polygon's vertices — enough to tell which side of a wall the
 *  room's interior is on, which is all either caller needs it for. */
function polygonCentroid(polygon: Vec2[]): Vec2 {
  const n = polygon.length;
  return polygon.reduce((acc, p) => ({ x: acc.x + p.x / n, z: acc.z + p.z / n }), { x: 0, z: 0 });
}

function openingKeepOutBoxes(
  house: HouseModel,
  roomId: RoomId,
  includeVoid: (v: { isProtected?: boolean; kind: OpeningKind }) => boolean,
  marginM: number,
  clearanceM: number,
): KeepOutBox[] {
  const room = house.rooms.find((r) => r.id === roomId);
  if (!room) return [];
  const centroid = polygonCentroid(room.floorPolygon);
  const walls = buildAllWalls(house.rooms, house.openings).filter((w) => w.roomId === roomId);
  const boxes: KeepOutBox[] = [];
  for (const wall of walls) {
    for (const v of wall.voids) {
      if (!includeVoid(v)) continue;
      const t0 = v.t0 - marginM;
      const t1 = v.t1 + marginM;
      const ax = wall.start.x + wall.ux * t0;
      const az = wall.start.z + wall.uz * t0;
      const bx = wall.start.x + wall.ux * t1;
      const bz = wall.start.z + wall.uz * t1;
      // Perpendicular to the wall tangent; sign chosen so it points into the room.
      const nx = -wall.uz;
      const nz = wall.ux;
      const towardCenter = (centroid.x - wall.start.x) * nx + (centroid.z - wall.start.z) * nz;
      const sign = towardCenter >= 0 ? 1 : -1;
      const dx = nx * sign * clearanceM;
      const dz = nz * sign * clearanceM;
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
  const keepouts = openingKeepOutBoxes(
    house,
    'mamad',
    (v) => Boolean(v.isProtected),
    MAMAD_MARGIN_M,
    MAMAD_CLEARANCE_M,
  );
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

/** How far in front of an opening furniture has to stand before it counts as
 *  being "in" the way rather than merely beside it. */
const DOORWAY_APPROACH_DEPTH_M = 0.55;
/** The clear width a person needs to get through. An opening keeps its
 *  circulation as long as SOME contiguous run of it this wide stays clear —
 *  which is the difference between a wardrobe across a 0.9 m door (blocked)
 *  and an island beside a 2.65 m terrace span (not blocked, and normal
 *  open-plan design). */
const MIN_PASSAGE_WIDTH_M = 0.75;

/** Openings a person actually passes through. A window is an opening too, but
 *  a sideboard under one blocks nothing. */
const CIRCULATION_OPENING_KINDS = new Set<OpeningKind>(['door', 'exterior_opening', 'open_threshold']);

export interface BlockedOpening {
  openingId: string;
  roomId: RoomId;
  /** Widest contiguous run of the opening still clear, in metres. */
  clearWidthM: number;
  requiredWidthM: number;
  blockedByItemIds: string[];
}

/**
 * Openings whose walkable width furniture has cut below what a person needs,
 * in ANY room.
 *
 * The house evidence asserts a circulation constraint — the spine stays
 * walkable — but until this existed nothing enforced it beyond MAMAD:
 * findUnreachableRooms only walks `connectedRoomIds`, which is pure graph
 * adjacency and knows nothing about objects, so a console or wardrobe could
 * sit squarely in an ordinary corridor doorway and every check still passed.
 *
 * Measured as remaining PASSABLE WIDTH rather than "is anything near the
 * opening", because those differ exactly where it matters. Requiring a wide
 * opening to be furniture-free flags the kitchen island standing beside a
 * 2.65 m terrace span, which is ordinary open-plan design and blocks nobody;
 * what actually matters is whether a clear run wide enough to walk through
 * survives. Geometry comes from the same wallPanels void data the openings
 * are cut from, and anything a walker steps over rather than around is
 * ignored.
 */
export function findBlockedCirculationOpenings(house: HouseModel, items: FurnitureItem[]): BlockedOpening[] {
  const blocked: BlockedOpening[] = [];
  for (const room of house.rooms) {
    const roomItems = items.filter((i) => i.roomId === room.id && occupiesWalkingVolume(i));
    if (roomItems.length === 0) continue;

    const centroid = polygonCentroid(room.floorPolygon);
    const walls = buildAllWalls(house.rooms, house.openings).filter((w) => w.roomId === room.id);
    for (const wall of walls) {
      // Wall tangent, and the normal pointing into this room.
      const nx = -wall.uz;
      const nz = wall.ux;
      const sign = (centroid.x - wall.start.x) * nx + (centroid.z - wall.start.z) * nz >= 0 ? 1 : -1;

      for (const v of wall.voids) {
        if (!CIRCULATION_OPENING_KINDS.has(v.kind)) continue;

        // Project each candidate item into (along-wall, into-room) coordinates
        // and record the span of the opening it stands in front of.
        const occluded: Array<{ from: number; to: number; id: string }> = [];
        for (const item of roomItems) {
          let tMin = Infinity;
          let tMax = -Infinity;
          let nMin = Infinity;
          let nMax = -Infinity;
          for (const c of furnitureWorldCorners(item)) {
            const dx = c.x - wall.start.x;
            const dz = c.z - wall.start.z;
            const t = dx * wall.ux + dz * wall.uz;
            const n = (dx * nx + dz * nz) * sign;
            tMin = Math.min(tMin, t);
            tMax = Math.max(tMax, t);
            nMin = Math.min(nMin, n);
            nMax = Math.max(nMax, n);
          }
          // Not standing in the approach zone at all.
          if (nMax <= 0 || nMin >= DOORWAY_APPROACH_DEPTH_M) continue;
          const from = Math.max(v.t0, tMin);
          const to = Math.min(v.t1, tMax);
          if (to > from) occluded.push({ from, to, id: item.id });
        }
        if (occluded.length === 0) continue;

        // Widest contiguous clear run left across the opening.
        occluded.sort((a, b) => a.from - b.from);
        let clearWidthM = 0;
        let cursor = v.t0;
        for (const span of occluded) {
          if (span.from > cursor) clearWidthM = Math.max(clearWidthM, span.from - cursor);
          cursor = Math.max(cursor, span.to);
        }
        clearWidthM = Math.max(clearWidthM, v.t1 - cursor);

        if (clearWidthM < MIN_PASSAGE_WIDTH_M) {
          blocked.push({
            openingId: v.openingId,
            roomId: room.id,
            clearWidthM: Number(clearWidthM.toFixed(3)),
            requiredWidthM: MIN_PASSAGE_WIDTH_M,
            blockedByItemIds: occluded.map((o) => o.id),
          });
        }
      }
    }
  }
  return blocked;
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

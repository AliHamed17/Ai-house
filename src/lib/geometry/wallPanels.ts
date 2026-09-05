/**
 * Converts an authored WallSpec + the global openings list into renderable
 * wall panel boxes and floor-level collision spans.
 *
 * Algorithm: project every opening that references this wall's room onto the
 * wall's centerline (a simple point-to-line-segment projection). Any opening
 * that lands on the line (within a small tolerance) and within the segment's
 * length becomes a "void" in the wall's local (t, y) frame, where t runs
 * 0..length along the wall and y runs 0..height vertically. We then sweep
 * left-to-right, collecting the union of void t-ranges as breakpoints, and
 * for each resulting strip emit boxes for whatever (t, y) sub-rectangles
 * remain solid. This correctly handles multiple non-overlapping openings on
 * one wall (e.g. a door plus a window) without a general CSG library.
 */

import type { OpeningDef, RoomDef, Vec2, WallSpec } from '@/lib/types';
import { WALL_THICKNESS_M } from '@/data/house';

const EPS = 0.05;
const FLOOR_EPS = 0.02;

export interface WallVoid {
  t0: number;
  t1: number;
  y0: number;
  y1: number;
  kind: OpeningDef['kind'];
  openingId: string;
  isProtected: boolean;
}

export interface WallPanelBox {
  /** World-space center of the box. */
  center: Vec2 & { y: number };
  widthM: number;
  heightM: number;
  depthM: number;
  rotationYRad: number;
}

export interface Span {
  t0: number;
  t1: number;
}

export interface BuiltWall {
  wallId: string;
  roomId: string;
  exterior: boolean;
  start: Vec2;
  end: Vec2;
  length: number;
  angleRad: number;
  /** Unit tangent vector along the wall (world space). */
  ux: number;
  uz: number;
  heightM: number;
  thicknessM: number;
  voids: WallVoid[];
  renderPanels: WallPanelBox[];
  collisionSolidSpans: Span[];
  doorSpans: Span[];
}

function wallGeometry(start: Vec2, end: Vec2) {
  const dx = end.x - start.x;
  const dz = end.z - start.z;
  const length = Math.hypot(dx, dz);
  return { ux: dx / length, uz: dz / length, length, angleRad: Math.atan2(dx, dz) };
}

function projectOntoWall(point: Vec2, start: Vec2, end: Vec2, ux: number, uz: number) {
  const px = point.x - start.x;
  const pz = point.z - start.z;
  const t = px * ux + pz * uz;
  const perp = Math.abs(-px * uz + pz * ux);
  return { t, perp };
}

export function findOpeningsForWall(wall: WallSpec, openings: OpeningDef[], roomId: string): WallVoid[] {
  const { ux, uz, length } = wallGeometry(wall.start, wall.end);
  const voids: WallVoid[] = [];
  for (const o of openings) {
    const involvesRoom = o.roomId === roomId || o.roomA === roomId || o.roomB === roomId;
    if (!involvesRoom) continue;
    const { t, perp } = projectOntoWall(o.position, wall.start, wall.end, ux, uz);
    if (perp > EPS) continue;
    if (t < -EPS || t > length + EPS) continue;
    const half = o.widthM / 2;
    voids.push({
      t0: Math.max(0, t - half),
      t1: Math.min(length, t + half),
      y0: o.sillM,
      y1: o.headM,
      kind: o.kind,
      openingId: o.id,
      isProtected: Boolean(o.isProtected),
    });
  }
  voids.sort((a, b) => a.t0 - b.t0);
  return voids;
}

function mergeSpans(spans: Span[]): Span[] {
  if (spans.length === 0) return [];
  const sorted = [...spans].sort((a, b) => a.t0 - b.t0);
  const out: Span[] = [{ ...sorted[0] }];
  for (const s of sorted.slice(1)) {
    const last = out[out.length - 1];
    if (s.t0 <= last.t1 + EPS) {
      last.t1 = Math.max(last.t1, s.t1);
    } else {
      out.push({ ...s });
    }
  }
  return out;
}

function subtractSpans(full: Span, holes: Span[]): Span[] {
  let remaining: Span[] = [{ ...full }];
  for (const hole of holes) {
    const next: Span[] = [];
    for (const r of remaining) {
      if (hole.t1 <= r.t0 + EPS || hole.t0 >= r.t1 - EPS) {
        next.push(r);
        continue;
      }
      if (hole.t0 > r.t0 + EPS) next.push({ t0: r.t0, t1: hole.t0 });
      if (hole.t1 < r.t1 - EPS) next.push({ t0: hole.t1, t1: r.t1 });
    }
    remaining = next;
  }
  return remaining.filter((s) => s.t1 - s.t0 > EPS);
}

export function buildWall(wall: WallSpec, room: RoomDef, openings: OpeningDef[]): BuiltWall {
  const { ux, uz, length, angleRad } = wallGeometry(wall.start, wall.end);
  const heightM = room.wallHeightOverrideM ?? room.ceilingHeightM;
  const thicknessM = WALL_THICKNESS_M;
  const voids = findOpeningsForWall(wall, openings, room.id);

  // Breakpoints along t from every void's t0/t1, plus the wall's own extents.
  const breakpoints = new Set<number>([0, length]);
  for (const v of voids) {
    breakpoints.add(Math.max(0, v.t0));
    breakpoints.add(Math.min(length, v.t1));
  }
  const sortedT = Array.from(breakpoints).sort((a, b) => a - b);

  const renderPanels: WallPanelBox[] = [];
  for (let i = 0; i < sortedT.length - 1; i++) {
    const ta = sortedT[i];
    const tb = sortedT[i + 1];
    const tMid = (ta + tb) / 2;
    if (tb - ta <= EPS) continue;

    const covering = voids.filter((v) => v.t0 <= tMid && v.t1 >= tMid);
    const ySolid = subtractSpans({ t0: 0, t1: heightM }, covering.map((v) => ({ t0: v.y0, t1: v.y1 })));

    for (const y of ySolid) {
      const midT = tMid;
      const worldX = wall.start.x + ux * midT;
      const worldZ = wall.start.z + uz * midT;
      renderPanels.push({
        center: { x: worldX, y: (y.t0 + y.t1) / 2, z: worldZ },
        widthM: tb - ta,
        heightM: y.t1 - y.t0,
        depthM: thicknessM,
        // Three.js rotation.y rotates local +X toward world +Z, but angleRad
        // is the wall's tangent direction measured from world +Z toward +X
        // (atan2(dx,dz)) — offset the two conventions by 90 degrees so the
        // box's width axis (local X) actually lines up with the wall.
        rotationYRad: angleRad - Math.PI / 2,
      });
    }
  }

  const floorGaps = voids
    .filter((v) => v.y0 <= FLOOR_EPS && (v.kind === 'door' || v.kind === 'exterior_opening' || v.kind === 'open_threshold'))
    .map((v) => ({ t0: v.t0, t1: v.t1 }));
  const collisionSolidSpans = subtractSpans({ t0: 0, t1: length }, mergeSpans(floorGaps));
  const doorSpans = mergeSpans(floorGaps);

  return {
    wallId: wall.id,
    roomId: room.id,
    exterior: wall.exterior,
    start: wall.start,
    end: wall.end,
    length,
    angleRad,
    ux,
    uz,
    heightM,
    thicknessM,
    voids,
    renderPanels,
    collisionSolidSpans,
    doorSpans,
  };
}

export function buildAllWalls(rooms: RoomDef[], openings: OpeningDef[]): BuiltWall[] {
  const built: BuiltWall[] = [];
  for (const room of rooms) {
    for (const wall of room.walls) {
      built.push(buildWall(wall, room, openings));
    }
  }
  return built;
}

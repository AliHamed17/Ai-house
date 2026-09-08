/**
 * Authoritative house model: rooms, explicitly-authored wall segments, and
 * openings (doors/windows/exterior openings/open-plan thresholds).
 *
 * Design notes (see ASSUMPTIONS.md and analysis/house-evidence.json for the
 * full rationale and confidence levels):
 *
 * - 1 world unit = 1 meter. Origin is arbitrary; +x is east, +z is south.
 * - Walls are explicitly authored per room rather than auto-derived from
 *   polygon edges. This lets two adjoining rooms share a physical boundary
 *   without a generic edge-matching/CSG algorithm: whichever room "owns" a
 *   shared boundary draws it (with any door/window voids), and the other
 *   room simply omits that wall. Doors and windows are still declared once
 *   in `openings` and are attached to a wall automatically by projecting
 *   the opening's position onto the wall's centerline (see
 *   lib/geometry/wallPanels.ts) — so both sides of a real doorway
 *   automatically line up without hand-duplicating coordinates.
 * - Living, kitchen, and dining are one continuous open-plan volume (no
 *   dividing wall), matching the evidence of a single open social zone.
 * - The MAMAD room and its single protected door/window are flagged
 *   `isProtected`/`isProtected` and must never be altered by material
 *   variants, lighting modes, or AI-generated concepts.
 */

import type { HouseModel, OpeningDef, RoomDef, RoomId, StructuralFeature, Vec2, WallSpec } from '@/lib/types';

export const WALL_THICKNESS_M = 0.2;
export const CEILING_HEIGHT_M = 2.7;
export const PARAPET_HEIGHT_M = 1.1;
export const LIVING_CHAMFER_M = 1.3;
export const DOOR_HEIGHT_M = 2.1;
export const EYE_HEIGHT_M = 1.62;
export const PLAYER_RADIUS_M = 0.28;

export const ENTRY_ROOM_ID = 'stair_landing';

function v(x: number, z: number): Vec2 {
  return { x, z };
}

function wall(id: string, start: Vec2, end: Vec2, exterior: boolean): WallSpec {
  return { id, start, end, exterior };
}

// ---------------------------------------------------------------------------
// Rooms
// ---------------------------------------------------------------------------

const rooms: RoomDef[] = [
  {
    id: 'stair_landing',
    nameEn: 'Exterior Approach & Stair',
    nameHe: null,
    function: 'Exterior circulation from the street up to the entry landing.',
    dimensions: { widthM: 2.07, depthM: 3.18 },
    dimensionSource: 'assumption — not dimensioned on plan; derived from video framing only',
    confidence: 'low',
    floorPolygon: [v(4.9, -5.5), v(6.97, -5.5), v(6.97, -2.32), v(4.9, -2.32)],
    walls: [
      wall('stair_n', v(4.9, -5.5), v(6.97, -5.5), true),
      wall('stair_e', v(6.97, -5.5), v(6.97, -2.32), true),
      wall('stair_w', v(4.9, -2.32), v(4.9, -5.5), true),
    ],
    ceilingHeightM: CEILING_HEIGHT_M,
    wallHeightOverrideM: PARAPET_HEIGHT_M,
    floorMaterialId: 'exterior-stone',
    wallMaterialId: 'exterior-render',
    isWetRoom: false,
    isProtected: false,
    isExterior: true,
    connectedRoomIds: ['balcony_service'],
    visibleFeatures: ['textured render exterior wall', 'stone/tile steps', 'neighborhood + hillside view'],
    unresolvedQuestions: ['Exact stair rise/run and total flight length are not legible in either source.'],
    cameraSpawn: v(5.93, -3.9),
    cameraSpawnYaw: Math.PI,
    hotspotLabel: 'Exterior Approach',
  },
  {
    id: 'balcony_service',
    nameEn: 'Balcony / Service Landing',
    nameHe: 'מרפסת',
    function: 'Small exterior balcony or service area beside the stair; exact use configurable.',
    dimensions: { widthM: 2.07, depthM: 2.32 },
    dimensionSource: 'plan labels 207 / 232 (cm) near the stair',
    confidence: 'high',
    floorPolygon: [v(4.9, -2.32), v(6.97, -2.32), v(6.97, 0), v(4.9, 0)],
    walls: [
      wall('balc_n', v(4.9, -2.32), v(6.97, -2.32), true),
      wall('balc_e', v(6.97, -2.32), v(6.97, 0), true),
      wall('balc_w', v(4.9, 0), v(4.9, -2.32), true),
    ],
    ceilingHeightM: CEILING_HEIGHT_M,
    wallHeightOverrideM: PARAPET_HEIGHT_M,
    floorMaterialId: 'exterior-stone',
    wallMaterialId: 'exterior-render',
    isWetRoom: false,
    isProtected: false,
    isExterior: true,
    connectedRoomIds: ['stair_landing', 'entry_hall'],
    visibleFeatures: ['adjoins exterior stair', 'compact footprint'],
    unresolvedQuestions: ['Leisure vs. laundry/service use is not confirmed; kept configurable.'],
    cameraSpawn: v(5.93, -1.16),
    cameraSpawnYaw: Math.PI,
    hotspotLabel: 'Balcony / Landing',
  },
  {
    id: 'entry_hall',
    nameEn: 'Entry & Central Hall',
    nameHe: null,
    function: 'Arrival circulation linking the exterior, social zone, MAMAD, and private wing.',
    dimensions: { widthM: 2.4, depthM: 3.0 },
    dimensionSource: 'assumption — circulation footprint inferred from adjacency',
    confidence: 'low',
    floorPolygon: [v(4.9, 0), v(7.3, 0), v(7.3, 3.0), v(4.9, 3.0)],
    walls: [
      wall('entry_n', v(4.9, 0), v(7.3, 0), true),
      wall('entry_e', v(7.3, 0), v(7.3, 3.0), false),
      // Boundary with hall_south, carrying the opening_entry_hallsouth
      // threshold below (mamad's own mamad_s wall covers the rest of that
      // z=3.0 line for x 7.3-10.8).
      wall('entry_s', v(7.3, 3.0), v(4.9, 3.0), false),
      // Boundary with living, carrying the doorway opening_entry_living below.
      wall('entry_w', v(4.9, 3.0), v(4.9, 0), false),
    ],
    ceilingHeightM: CEILING_HEIGHT_M,
    floorMaterialId: 'stone-entry',
    wallMaterialId: 'wall-warm-plaster',
    isWetRoom: false,
    isProtected: false,
    isExterior: false,
    connectedRoomIds: ['balcony_service', 'living', 'mamad', 'hall_south'],
    visibleFeatures: ['threshold into open social zone', 'wet-room doorway visible in walkthrough 00:06-00:12'],
    unresolvedQuestions: [],
    cameraSpawn: v(6.1, 1.5),
    cameraSpawnYaw: Math.PI / 2,
    hotspotLabel: 'Entry Hall',
  },
  {
    id: 'living',
    nameEn: 'Living Room',
    nameHe: 'סלון',
    function: 'Principal lounge, open to kitchen and dining.',
    dimensions: { widthM: 4.67, depthM: 3.96 },
    dimensionSource: 'plan labels 467 / 396 (cm)',
    confidence: 'high',
    floorPolygon: [v(0, 1.3), v(1.3, 0), v(4.9, 0), v(4.9, 4.0), v(0, 4.0)],
    walls: [
      wall('living_chamfer', v(0, 1.3), v(1.3, 0), true),
      wall('living_n', v(1.3, 0), v(4.9, 0), true),
      wall('living_e_lower', v(4.9, 3.0), v(4.9, 4.0), false),
      wall('living_w', v(0, 4.0), v(0, 1.3), true),
    ],
    ceilingHeightM: CEILING_HEIGHT_M,
    floorMaterialId: 'limestone-social',
    wallMaterialId: 'wall-warm-plaster',
    isWetRoom: false,
    isProtected: false,
    isExterior: false,
    connectedRoomIds: ['entry_hall', 'kitchen', 'dining'],
    visibleFeatures: [
      'curved/angled exterior facade corner',
      'multiple tall window openings',
      'sofa group drawn on plan',
      'structural column visible in walkthrough 00:12-00:20',
    ],
    unresolvedQuestions: ['Exact facade curve radius is not legible; modeled as a configurable ~1.3 m chamfer.'],
    // Was (2.5, 2.2) — only 0.283 m from column_living at (2.3, 2.0), inside
    // the column+player collision radius (0.5 m). Entering or teleporting
    // here assigns the camera position directly; collision resolution only
    // runs once movement begins, so the camera would start out rendered
    // inside the column (regression).
    cameraSpawn: v(2.5, 3.0),
    cameraSpawnYaw: Math.PI / 2,
    hotspotLabel: 'Living Room',
  },
  {
    id: 'kitchen',
    nameEn: 'Kitchen',
    nameHe: 'מטבח',
    function: 'Open kitchen attached to the social space.',
    dimensions: { widthM: 3.1, depthM: 3.22 },
    dimensionSource: 'plan labels 322 / 300 (cm)',
    confidence: 'high',
    floorPolygon: [v(0, 4.0), v(3.1, 4.0), v(3.1, 7.3), v(0, 7.3)],
    walls: [
      wall('kitchen_s', v(3.1, 7.3), v(0, 7.3), true),
      wall('kitchen_w', v(0, 7.3), v(0, 4.0), true),
    ],
    ceilingHeightM: CEILING_HEIGHT_M,
    floorMaterialId: 'limestone-social',
    wallMaterialId: 'wall-warm-plaster',
    isWetRoom: false,
    isProtected: false,
    isExterior: false,
    connectedRoomIds: ['living', 'dining', 'terrace_social'],
    visibleFeatures: ['L-shaped counter outline', 'double-sink symbol'],
    unresolvedQuestions: ['Island feasibility not confirmed; drawn L-shaped logic preserved by default.'],
    cameraSpawn: v(1.55, 5.65),
    cameraSpawnYaw: Math.PI / 2,
    hotspotLabel: 'Kitchen',
  },
  {
    id: 'dining',
    nameEn: 'Dining Area',
    nameHe: null,
    function: 'Six-seat dining position, circulation hinge to the private wing.',
    dimensions: { widthM: 1.8, depthM: 3.3 },
    dimensionSource: 'plan labels 232 / 300 (cm) near the oval table',
    confidence: 'medium',
    floorPolygon: [v(3.1, 4.0), v(4.9, 4.0), v(4.9, 7.3), v(3.1, 7.3)],
    walls: [
      wall('dining_e', v(4.9, 4.0), v(4.9, 7.3), true),
      wall('dining_s', v(4.9, 7.3), v(3.1, 7.3), true),
    ],
    ceilingHeightM: CEILING_HEIGHT_M,
    floorMaterialId: 'limestone-social',
    wallMaterialId: 'wall-warm-plaster',
    isWetRoom: false,
    isProtected: false,
    isExterior: false,
    connectedRoomIds: ['living', 'kitchen', 'terrace_social'],
    visibleFeatures: ['oval/round 6-seat table drawn on plan'],
    unresolvedQuestions: [],
    cameraSpawn: v(4.0, 5.65),
    cameraSpawnYaw: Math.PI,
    hotspotLabel: 'Dining',
  },
  {
    id: 'terrace_social',
    nameEn: 'Covered Terrace',
    nameHe: 'מרפסת',
    function: 'Covered exterior space opening off the social zone.',
    dimensions: { widthM: 4.9, depthM: 2.2 },
    dimensionSource: 'assumption — inferred from walkthrough 00:20-00:25',
    confidence: 'low',
    floorPolygon: [v(0, 7.3), v(4.9, 7.3), v(4.9, 9.5), v(0, 9.5)],
    walls: [
      wall('terrace_e', v(4.9, 7.3), v(4.9, 9.5), true),
      wall('terrace_s', v(4.9, 9.5), v(0, 9.5), true),
      wall('terrace_w', v(0, 9.5), v(0, 7.3), true),
    ],
    ceilingHeightM: CEILING_HEIGHT_M,
    wallHeightOverrideM: PARAPET_HEIGHT_M,
    floorMaterialId: 'exterior-stone',
    wallMaterialId: 'exterior-render',
    isWetRoom: false,
    isProtected: false,
    isExterior: true,
    hasCeiling: true, // a covered recess/loggia, unlike the open-air exterior approach/balcony
    connectedRoomIds: ['kitchen', 'dining'],
    visibleFeatures: ['covered recess/loggia', 'parapet-height openings', 'neighborhood view'],
    unresolvedQuestions: ['Exact depth and parapet height are not confirmed.'],
    cameraSpawn: v(2.45, 8.4),
    cameraSpawnYaw: 0,
    hotspotLabel: 'Terrace',
  },
  {
    id: 'mamad',
    nameEn: 'MAMAD (Protected Room)',
    nameHe: 'מ.מ.ד',
    function: "Israeli protected room; usable as bedroom, office, or flexible guest room without altering protected elements.",
    dimensions: { widthM: 3.5, depthM: 3.0 },
    dimensionSource: 'plan labels 350 / 300 (cm); reinforced perimeter indicated on plan',
    confidence: 'high',
    floorPolygon: [v(7.3, 0), v(10.8, 0), v(10.8, 3.0), v(7.3, 3.0)],
    walls: [
      wall('mamad_n', v(7.3, 0), v(10.8, 0), true),
      wall('mamad_e', v(10.8, 0), v(10.8, 3.0), false),
      wall('mamad_s', v(10.8, 3.0), v(7.3, 3.0), false),
      wall('mamad_w', v(7.3, 3.0), v(7.3, 0), false),
    ],
    ceilingHeightM: CEILING_HEIGHT_M,
    floorMaterialId: 'oak-bedroom',
    wallMaterialId: 'wall-warm-plaster',
    isWetRoom: false,
    isProtected: true,
    isExterior: false,
    connectedRoomIds: ['entry_hall'],
    visibleFeatures: ['single protected door to entry hall only', 'single protected window on exterior wall'],
    unresolvedQuestions: [],
    cameraSpawn: v(9.05, 1.5),
    cameraSpawnYaw: 0,
    hotspotLabel: 'MAMAD',
  },
  {
    id: 'twin_bed',
    nameEn: "Twin / Children's Bedroom",
    nameHe: 'ח. שינה',
    function: "Children's, siblings', or flexible guest bedroom.",
    dimensions: { widthM: 4.39, depthM: 3.5 },
    dimensionSource: 'plan labels 439 / 350 (cm)',
    confidence: 'high',
    floorPolygon: [v(10.8, 0), v(15.19, 0), v(15.19, 3.5), v(10.8, 3.5)],
    walls: [
      wall('twin_n', v(10.8, 0), v(15.19, 0), true),
      wall('twin_e', v(15.19, 0), v(15.19, 3.5), true),
      // Pulled back from x=10.8 to x=11.6: unlike twin_w, this wall carries
      // no opening of its own, so its un-shortened endpoint sat exactly on
      // the doorway's own crossing line — its player-radius-expanded corner
      // (reaching to x=10.8+~0.28) overlapped mamad_e's own expanded corner
      // there, leaving no collision-free path through, regardless of how
      // wide the void cut into twin_w/hs_twin was (regression). 11.6 keeps
      // this wall's own reach (11.6-radius) past x=11.18 — mamad_e's own
      // expanded corner on the OTHER axis — so the two never overlap at all.
      wall('twin_s', v(15.19, 3.5), v(11.6, 3.5), false),
      wall('twin_w', v(10.8, 3.5), v(10.8, 0), false),
    ],
    ceilingHeightM: CEILING_HEIGHT_M,
    floorMaterialId: 'oak-bedroom',
    wallMaterialId: 'wall-warm-plaster',
    isWetRoom: false,
    isProtected: false,
    isExterior: false,
    connectedRoomIds: ['hall_south'],
    visibleFeatures: ['two single beds drawn on plan', 'view-facing window in walkthrough 00:42-00:47'],
    unresolvedQuestions: [],
    cameraSpawn: v(13.0, 1.75),
    cameraSpawnYaw: -Math.PI / 2,
    hotspotLabel: 'Twin Bedroom',
  },
  {
    id: 'hall_south',
    nameEn: 'Private Corridor',
    nameHe: null,
    function: 'Circulation connecting the bedrooms and wet rooms.',
    dimensions: { widthM: 5.9, depthM: 6.85 },
    dimensionSource: 'assumption — corridor footprint inferred from adjacency',
    confidence: 'low',
    floorPolygon: [
      v(4.9, 3.0),
      v(10.8, 3.0),
      // This notch's north edge is 3.7 rather than the 3.5 a straight
      // adjacency inference would suggest — mamad_e (a protected room's
      // real, plan-sourced wall) is solid for the full z<3.0 span, so the
      // hall_south/twin_bed doorway must clear entirely above z=3.0 to be
      // walkable at all; a notch that stopped at 3.5 left only a 0.5 m
      // passage there, narrower than PLAYER_RADIUS_M*2 (regression).
      v(10.8, 3.7),
      v(11.9, 3.7),
      v(11.9, 9.85),
      v(10.8, 9.85),
      // 4.0 -> 4.3, matching hs_south/hs_link_w_wc below — see the comment
      // on hs_link_w_wc for why (a too-narrow gap to wc_guest, regression).
      v(10.8, 4.3),
      v(4.9, 4.3),
    ],
    walls: [
      wall('hs_twin', v(10.8, 3.0), v(10.8, 3.7), false),
      // Same reasoning as twin_s's shortening above: this wall's own
      // unshortened endpoint also sat exactly on the doorway's crossing
      // line (x=10.8), so it created the identical corner-overlap problem
      // from the opposite side once twin_s no longer blocked there
      // (regression) — pulled back to x=11.6 for the same margin as twin_s.
      wall('hs_link_top', v(11.6, 3.7), v(11.9, 3.7), true),
      wall('hs_link_e_void', v(11.9, 3.7), v(11.9, 6.35), true),
      wall('hs_link_e_parents', v(11.9, 6.35), v(11.9, 9.85), false),
      wall('hs_link_bottom', v(11.9, 9.85), v(10.8, 9.85), true),
      wall('hs_link_w_void', v(10.8, 9.85), v(10.8, 5.2), true),
      // z=4.0 -> 4.3: at z=4.0, this wall's own player-radius-expanded
      // corner (4.0-radius=3.72) overlapped mamad_e's (3.0+radius=3.28) by
      // 0.56 m, leaving only a 0.44 m gap — narrower than the player's
      // 0.56 m collision diameter regardless of how the twin_bed doorway
      // itself was shaped (regression). wc_guest is assumption-sized
      // (medium confidence, no plan measurement), so its matching
      // wcguest_e/floorPolygon boundary is nudged the same 0.3 m below.
      wall('hs_link_w_wc', v(10.8, 5.2), v(10.8, 4.3), false),
      wall('hs_south', v(10.8, 4.3), v(4.9, 4.3), false),
    ],
    ceilingHeightM: CEILING_HEIGHT_M,
    floorMaterialId: 'stone-entry',
    wallMaterialId: 'wall-warm-plaster',
    isWetRoom: false,
    isProtected: false,
    isExterior: false,
    connectedRoomIds: ['entry_hall', 'twin_bed', 'bathroom_main', 'bathroom_ensuite', 'wc_guest', 'parents_bed'],
    visibleFeatures: ['junction of unfinished door openings visible in walkthrough 00:33-00:38'],
    unresolvedQuestions: [],
    cameraSpawn: v(6.1, 3.5),
    cameraSpawnYaw: -Math.PI / 2,
    hotspotLabel: 'Private Corridor',
  },
  {
    id: 'bathroom_main',
    nameEn: 'Main Bathroom',
    nameHe: 'מקלחת',
    function: 'Shared full bathroom.',
    dimensions: { widthM: 1.5, depthM: 2.35 },
    dimensionSource: 'plan label ~2.35 x 1.50 (m) per evidence brief interpretation',
    confidence: 'medium-high',
    // North edge 4.0 -> 4.3, matching hs_south's own move (see its comment
    // in hall_south) — the doors moved with it already, but this floor
    // polygon (and bathmain_e below) did not, leaving a 0.3m strip where
    // this room's floor and hall_south's now-larger one coplanar-overlapped
    // (regression). South edge 6.35 -> 6.65 restores the declared 2.35m
    // depth that moving only the north edge had silently shrunk to 2.05m
    // (regression); bathmain_s is exterior, so nothing else borders it here.
    floorPolygon: [v(7.3, 4.3), v(8.8, 4.3), v(8.8, 6.65), v(7.3, 6.65)],
    walls: [
      wall('bathmain_e', v(8.8, 4.3), v(8.8, 6.65), false),
      wall('bathmain_s', v(8.8, 6.65), v(7.3, 6.65), true),
      wall('bathmain_w', v(7.3, 6.65), v(7.3, 4.3), true),
    ],
    ceilingHeightM: CEILING_HEIGHT_M,
    floorMaterialId: 'stone-wet',
    wallMaterialId: 'stone-wet',
    isWetRoom: true,
    isProtected: false,
    isExterior: false,
    connectedRoomIds: ['hall_south'],
    visibleFeatures: ['toilet, basin, shower/bath fixtures drawn on plan', 'dark waterproofing visible in walkthrough 00:25-00:33'],
    unresolvedQuestions: ['Exact door swing and fixture layout to be confirmed on site.'],
    cameraSpawn: v(8.05, 5.2),
    cameraSpawnYaw: 0,
    hotspotLabel: 'Main Bathroom',
  },
  {
    id: 'bathroom_ensuite',
    nameEn: "Parents' En-suite",
    nameHe: 'מקלחת',
    function: "Probable en-suite bathroom serving the parents' bedroom.",
    dimensions: { widthM: 1.1, depthM: 1.5 },
    dimensionSource: 'assumption — adjacency-based; exact dimensions not legible on the supplied plan crop',
    confidence: 'medium',
    // North edge 4.0 -> 4.3, same reasoning as bathroom_main above. South
    // edge 5.5 -> 5.8 likewise restores the declared 1.5m depth that moving
    // only the north edge had silently shrunk to 1.2m (regression);
    // bathensuite_s is exterior, so nothing else borders it here.
    floorPolygon: [v(8.8, 4.3), v(9.9, 4.3), v(9.9, 5.8), v(8.8, 5.8)],
    walls: [
      wall('bathensuite_e', v(9.9, 4.3), v(9.9, 5.8), false),
      wall('bathensuite_s', v(9.9, 5.8), v(8.8, 5.8), true),
    ],
    ceilingHeightM: CEILING_HEIGHT_M,
    floorMaterialId: 'stone-wet',
    wallMaterialId: 'stone-wet',
    isWetRoom: true,
    isProtected: false,
    isExterior: false,
    connectedRoomIds: ['hall_south'],
    visibleFeatures: ['second waterproofed wet area visible in walkthrough 00:47-00:51'],
    unresolvedQuestions: ['Direct en-suite connection to parents_bed vs. hall access only is not confirmed; modeled with hall access only.'],
    cameraSpawn: v(9.35, 4.75),
    cameraSpawnYaw: 0,
    hotspotLabel: "Parents' En-suite",
  },
  {
    id: 'wc_guest',
    nameEn: 'Guest WC',
    nameHe: null,
    function: 'Separate powder room.',
    // depthM 1.2 -> 0.9 (north edge z=4.0 -> 4.3): entirely within this
    // room's own assumption-based sizing tolerance — see hs_link_w_wc's
    // comment in hall_south for why (mamad_e sat only 1.0 m from this
    // room's original edge, too tight a gap once collision expansion is
    // applied, regardless of the twin_bed doorway's own shape).
    dimensions: { widthM: 0.9, depthM: 0.9 },
    dimensionSource: 'assumption — adjacency-based; exact dimensions not legible on the supplied plan crop',
    confidence: 'medium',
    floorPolygon: [v(9.9, 4.3), v(10.8, 4.3), v(10.8, 5.2), v(9.9, 5.2)],
    walls: [
      wall('wcguest_e', v(10.8, 4.3), v(10.8, 5.2), false),
      wall('wcguest_s', v(10.8, 5.2), v(9.9, 5.2), true),
    ],
    ceilingHeightM: CEILING_HEIGHT_M,
    floorMaterialId: 'stone-wet',
    wallMaterialId: 'stone-wet',
    isWetRoom: true,
    isProtected: false,
    isExterior: false,
    connectedRoomIds: ['hall_south'],
    visibleFeatures: ['small WC compartment opens near social circulation'],
    unresolvedQuestions: [],
    cameraSpawn: v(10.35, 4.6),
    cameraSpawnYaw: 0,
    hotspotLabel: 'Guest WC',
  },
  {
    id: 'parents_bed',
    nameEn: "Parents' Bedroom",
    nameHe: 'ח. הורים',
    function: 'Main bedroom.',
    dimensions: { widthM: 3.83, depthM: 3.5 },
    dimensionSource: 'plan labels 383 / 350 (cm)',
    confidence: 'high',
    floorPolygon: [v(11.9, 6.35), v(15.73, 6.35), v(15.73, 9.85), v(11.9, 9.85)],
    walls: [
      wall('parents_n', v(11.9, 6.35), v(15.73, 6.35), true),
      wall('parents_e', v(15.73, 6.35), v(15.73, 9.85), true),
      wall('parents_s', v(15.73, 9.85), v(11.9, 9.85), true),
      wall('parents_w', v(11.9, 9.85), v(11.9, 6.35), false),
    ],
    ceilingHeightM: CEILING_HEIGHT_M,
    floorMaterialId: 'oak-bedroom',
    wallMaterialId: 'wall-warm-plaster',
    isWetRoom: false,
    isProtected: false,
    isExterior: false,
    connectedRoomIds: ['hall_south'],
    visibleFeatures: ['double bed drawn on plan', 'construction bags/materials and window visible in walkthrough 00:51-00:57'],
    unresolvedQuestions: ['Bathroom door relationship (direct en-suite vs. hall-only access) not confirmed.'],
    cameraSpawn: v(13.8, 8.1),
    cameraSpawnYaw: -Math.PI / 2,
    hotspotLabel: "Parents' Bedroom",
  },
];

// ---------------------------------------------------------------------------
// Openings (doors / windows / exterior openings / open-plan thresholds)
// ---------------------------------------------------------------------------

const openings: OpeningDef[] = [
  { id: 'door_stair_balcony', kind: 'door', position: v(5.93, -2.32), widthM: 1.2, sillM: 0, headM: DOOR_HEIGHT_M, roomA: 'stair_landing', roomB: 'balcony_service', confidence: 'low' },
  { id: 'door_balcony_entry', kind: 'door', position: v(5.93, 0), widthM: 1.0, sillM: 0, headM: DOOR_HEIGHT_M, roomA: 'balcony_service', roomB: 'entry_hall', confidence: 'medium' },
  { id: 'opening_entry_living', kind: 'open_threshold', position: v(4.9, 1.5), widthM: 1.6, sillM: 0, headM: 2.4, roomA: 'entry_hall', roomB: 'living', confidence: 'medium' },
  { id: 'door_entry_mamad', kind: 'door', position: v(7.3, 1.5), widthM: 1.0, sillM: 0, headM: DOOR_HEIGHT_M, roomA: 'entry_hall', roomB: 'mamad', confidence: 'high', isProtected: true, note: 'MAMAD protected door — never remove, resize, or relocate.' },
  { id: 'opening_entry_hallsouth', kind: 'open_threshold', position: v(6.1, 3.0), widthM: 1.5, sillM: 0, headM: 2.4, roomA: 'entry_hall', roomB: 'hall_south', confidence: 'low' },
  { id: 'door_hallsouth_twin', kind: 'door', position: v(10.8, 3.25), widthM: 1.0, sillM: 0, headM: DOOR_HEIGHT_M, roomA: 'hall_south', roomB: 'twin_bed', confidence: 'medium' },
  // z=4.0 -> 4.3, matching hs_south's own move in hall_south (see its
  // comment there) — findOpeningsForWall only cuts an opening into a wall
  // it projects within EPS (0.05m) of, so leaving these at the wall's old
  // position left both doors uncut: a fully solid, collidable barrier
  // across both bathroom entrances, reachable only by teleporting
  // (regression). bathroom_main/bathroom_ensuite have no wall of their own
  // at this boundary (open-plan from their side, same as wc_guest before
  // its own wall needed moving), so only the door position needs updating.
  { id: 'door_hallsouth_bathmain', kind: 'door', position: v(8.05, 4.3), widthM: 0.9, sillM: 0, headM: DOOR_HEIGHT_M, roomA: 'hall_south', roomB: 'bathroom_main', confidence: 'medium' },
  { id: 'door_hallsouth_bathensuite', kind: 'door', position: v(9.35, 4.3), widthM: 0.9, sillM: 0, headM: DOOR_HEIGHT_M, roomA: 'hall_south', roomB: 'bathroom_ensuite', confidence: 'low' },
  { id: 'door_hallsouth_wcguest', kind: 'door', position: v(10.8, 4.6), widthM: 0.8, sillM: 0, headM: DOOR_HEIGHT_M, roomA: 'hall_south', roomB: 'wc_guest', confidence: 'low' },
  { id: 'door_hallsouth_parents', kind: 'door', position: v(11.9, 8.1), widthM: 1.0, sillM: 0, headM: DOOR_HEIGHT_M, roomA: 'hall_south', roomB: 'parents_bed', confidence: 'medium' },
  { id: 'opening_living_kitchen', kind: 'open_threshold', position: v(1.55, 4.0), widthM: 3.1, sillM: 0, headM: CEILING_HEIGHT_M, roomA: 'living', roomB: 'kitchen', confidence: 'high', note: 'Open social zone — no dividing wall.' },
  { id: 'opening_kitchen_dining', kind: 'open_threshold', position: v(3.1, 5.65), widthM: 3.3, sillM: 0, headM: CEILING_HEIGHT_M, roomA: 'kitchen', roomB: 'dining', confidence: 'medium' },
  { id: 'opening_living_dining', kind: 'open_threshold', position: v(4.0, 4.0), widthM: 1.8, sillM: 0, headM: CEILING_HEIGHT_M, roomA: 'living', roomB: 'dining', confidence: 'medium' },
  // The full opening (x 0.45-4.45 at z=7.3) crosses both kitchen_s (x 0-3.1,
  // owned by kitchen) and dining_s (x 3.1-4.9, owned by dining); a single
  // record naming only kitchen/terrace_social was never applied to dining_s
  // (findOpeningsForWall only cuts a wall for an opening that references
  // that wall's owning room), leaving that portion solid. Split at the same
  // x=3.1 wall boundary so each owning room gets its own cut, together
  // reproducing the original 4.0 m width.
  { id: 'exterior_opening_kitchen_terrace', kind: 'exterior_opening', position: v(1.775, 7.3), widthM: 2.65, sillM: 0, headM: 2.2, roomA: 'kitchen', roomB: 'terrace_social', confidence: 'low', note: 'Kitchen-side portion of the large opening toward the covered exterior space seen at 00:20-00:25.' },
  { id: 'exterior_opening_dining_terrace', kind: 'exterior_opening', position: v(3.775, 7.3), widthM: 1.35, sillM: 0, headM: 2.2, roomA: 'dining', roomB: 'terrace_social', confidence: 'low', note: 'Dining-side portion of the large opening toward the covered exterior space seen at 00:20-00:25.' },
  { id: 'window_living_1', kind: 'window', position: v(0, 2.0), widthM: 1.2, sillM: 0.4, headM: 2.3, roomId: 'living', confidence: 'medium' },
  { id: 'window_living_2', kind: 'window', position: v(0, 3.4), widthM: 1.2, sillM: 0.4, headM: 2.3, roomId: 'living', confidence: 'medium' },
  { id: 'window_kitchen_1', kind: 'window', position: v(0, 5.6), widthM: 1.0, sillM: 1.0, headM: 2.1, roomId: 'kitchen', confidence: 'low' },
  { id: 'window_mamad_1', kind: 'window', position: v(9.05, 0), widthM: 1.0, sillM: 1.4, headM: 1.9, roomId: 'mamad', confidence: 'medium', isProtected: true, note: 'MAMAD protected window — never remove, resize, or relocate.' },
  { id: 'window_twin_1', kind: 'window', position: v(15.19, 1.0), widthM: 1.2, sillM: 0.9, headM: 2.1, roomId: 'twin_bed', confidence: 'medium' },
  { id: 'window_twin_2', kind: 'window', position: v(15.19, 2.5), widthM: 1.2, sillM: 0.9, headM: 2.1, roomId: 'twin_bed', confidence: 'low' },
  { id: 'window_parents_1', kind: 'window', position: v(15.73, 7.5), widthM: 1.1, sillM: 0.9, headM: 2.1, roomId: 'parents_bed', confidence: 'medium' },
  { id: 'window_parents_2', kind: 'window', position: v(15.73, 9.0), widthM: 1.1, sillM: 0.9, headM: 2.1, roomId: 'parents_bed', confidence: 'low' },
  { id: 'window_bathmain_1', kind: 'window', position: v(7.3, 5.2), widthM: 0.6, sillM: 1.5, headM: 2.0, roomId: 'bathroom_main', confidence: 'low' },
];

const structuralFeatures: StructuralFeature[] = [
  { id: 'column_living', kind: 'column', position: v(2.3, 2.0), radiusM: 0.22, heightM: CEILING_HEIGHT_M, roomId: 'living' },
];

export const houseModel: HouseModel = { rooms, openings, structuralFeatures };

export const roomById = new Map<RoomId, RoomDef>(rooms.map((r) => [r.id, r]));
export function getRoom(id: RoomId): RoomDef | undefined {
  return roomById.get(id);
}

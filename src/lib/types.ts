/**
 * Shared domain types for the house model, geometry engine, and AI provider
 * abstraction. Keep this file framework-agnostic (no React/Three imports) so
 * it can be used from server code, client code, and tests alike.
 */

export type ConfidenceLevel = 'high' | 'medium-high' | 'medium' | 'low';

export type RoomId =
  | 'terrace_nw'
  | 'stair_landing'
  | 'living'
  | 'entry_hall'
  | 'kitchen'
  | 'dining'
  | 'mamad'
  | 'corridor'
  | 'bath_family'
  | 'wc'
  | 'bedroom_twin'
  | 'bedroom_parents';

/** A 2D point in meters, on the house's horizontal (floor) plane. */
export interface Vec2 {
  x: number;
  z: number;
}

export interface RoomDimensions {
  widthM: number;
  depthM: number;
}

export interface RoomDef {
  id: RoomId;
  nameEn: string;
  nameHe: string | null;
  /** Short description of the room's function, used in UI copy. */
  function: string;
  dimensions: RoomDimensions;
  dimensionSource: string;
  confidence: ConfidenceLevel;
  /** Closed polygon outline of the floor, meters, CCW winding, world space. */
  floorPolygon: Vec2[];
  /** Explicitly authored wall segments for this room (see geometry/walls.ts). */
  walls: WallSpec[];
  ceilingHeightM: number;
  /** Overrides ceilingHeightM for exterior/parapet spaces (balcony, stair). */
  wallHeightOverrideM?: number;
  floorMaterialId: string;
  wallMaterialId: string;
  isWetRoom: boolean;
  isProtected: boolean;
  isExterior: boolean;
  connectedRoomIds: RoomId[];
  visibleFeatures: string[];
  unresolvedQuestions: string[];
  /** Default first-person spawn point when teleporting into this room. */
  cameraSpawn: Vec2;
  /** Radians, 0 = facing +z. */
  cameraSpawnYaw: number;
  hotspotLabel: string;
}

export interface WallSpec {
  id: string;
  start: Vec2;
  end: Vec2;
  /** True if this wall faces the exterior (affects material + trim). */
  exterior: boolean;
}

export type OpeningKind = 'door' | 'window' | 'exterior_opening' | 'open_threshold';

export interface OpeningDef {
  id: string;
  kind: OpeningKind;
  /** World-space position of the opening's center, on a wall centerline. */
  position: Vec2;
  widthM: number;
  sillM: number;
  headM: number;
  /** Room(s) this opening connects. Windows only reference roomId. */
  roomA?: RoomId;
  roomB?: RoomId | 'exterior';
  roomId?: RoomId;
  confidence: ConfidenceLevel;
  isProtected?: boolean;
  note?: string;
}

export interface StructuralFeature {
  id: string;
  kind: 'column' | 'pier' | 'low_wall';
  position: Vec2;
  /** Round columns only. Square piers and low walls use `sizeM`/`thicknessM`. */
  radiusM: number;
  /** Plan side length of a square pier, or span of a low wall, meters. */
  sizeM?: number;
  /** Low walls only: depth across the span, meters. */
  thicknessM?: number;
  /** Low walls only: radians, 0 = span runs along +x. */
  rotationRad?: number;
  heightM: number;
  roomId: RoomId;
}

export interface HouseModel {
  rooms: RoomDef[];
  openings: OpeningDef[];
  structuralFeatures: StructuralFeature[];
}

// ---------------------------------------------------------------------------
// AI generation provider abstraction (Nano Banana / Higgsfield / mock)
// ---------------------------------------------------------------------------

export type GenerationProviderId = 'nano-banana' | 'higgsfield' | 'mock';
export type GenerationOutputType = 'image' | 'video';
export type GenerationStatus = 'queued' | 'in_progress' | 'completed' | 'failed' | 'moderated';

export interface GenerationInput {
  provider: GenerationProviderId;
  outputType: GenerationOutputType;
  roomId: RoomId;
  /** Style/material variation label, e.g. "warm-oak" | "cool-stone". */
  styleVariant: string;
  /** Source asset (video frame / plan crop / prior approved image) to reference or animate. */
  sourceAssetPath?: string;
  prompt: string;
  negativePrompt?: string;
  aspectRatio?: string;
  /** Origin of the incoming request (set by the route handler), used to build absolute asset URLs for providers that require one. */
  originUrl?: string;
  /** Demo-mode only: force the mock provider to resolve to this terminal state. */
  simulate?: 'success' | 'failure' | 'moderated';
}

export interface GenerationJob {
  jobId: string;
  provider: GenerationProviderId;
  outputType: GenerationOutputType;
  roomId: RoomId;
  status: GenerationStatus;
  createdAt: string;
  updatedAt: string;
  resultUrl?: string;
  resultWidth?: number;
  resultHeight?: number;
  error?: string;
  /** Generation metadata retained for provenance (never includes secrets). */
  meta: {
    model: string;
    styleVariant: string;
    prompt: string;
    negativePrompt?: string;
    sourceAssetPath?: string;
    approved: boolean;
  };
}

export interface MediaGenerationProvider {
  id: GenerationProviderId;
  submit(input: GenerationInput): Promise<{ jobId: string }>;
  status(jobId: string): Promise<GenerationJob>;
}

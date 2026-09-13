/**
 * Shared domain types for the house model, geometry engine, and AI provider
 * abstraction. Keep this file framework-agnostic (no React/Three imports) so
 * it can be used from server code, client code, and tests alike.
 */

export type ConfidenceLevel = 'high' | 'medium-high' | 'medium' | 'low';

export type RoomId =
  | 'stair_landing'
  | 'balcony_service'
  | 'entry_hall'
  | 'living'
  | 'kitchen'
  | 'dining'
  | 'terrace_social'
  | 'mamad'
  | 'twin_bed'
  | 'hall_south'
  | 'bathroom_main'
  | 'bathroom_ensuite'
  | 'wc_guest'
  | 'parents_bed';

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
  /** An exterior room that is actually roofed (a covered terrace/loggia, as
   * opposed to a genuinely open-air space like an approach or balcony) —
   * meaningful only when isExterior is true; overrides the default
   * exterior-implies-no-ceiling assumption. */
  hasCeiling?: boolean;
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
  kind: 'column';
  position: Vec2;
  radiusM: number;
  heightM: number;
  roomId: RoomId;
}

export interface HouseModel {
  rooms: RoomDef[];
  openings: OpeningDef[];
  structuralFeatures: StructuralFeature[];
}

// ---------------------------------------------------------------------------
// Furniture: procedural in-scene placements, each traceable to a real,
// purchasable product so a visitor can shop the room they're standing in.
// ---------------------------------------------------------------------------

export type FurnitureKind =
  | 'sofa'
  | 'lounge-chair'
  | 'coffee-table'
  | 'rug'
  | 'counter-stool'
  | 'dining-table'
  | 'bed'
  | 'nightstand'
  | 'desk'
  | 'wardrobe'
  | 'vanity';

export interface FurnitureItem {
  id: string;
  roomId: RoomId;
  kind: FurnitureKind;
  /** World-space meters, same frame as floorPolygon/cameraSpawn. */
  position: Vec2;
  /** Radians, 0 = local width axis along world +x (matches wall convention). */
  rotationYRad: number;
  footprintM: { widthM: number; depthM: number };
  heightM: number;
  colorHex: string;
  /** Short label shown in the shop panel, e.g. "Modular sofa". */
  shopLabel: string;
  category: string;
  retailer: string;
  /** Real, verified URL to a product or category page where this can be bought. */
  productUrl: string;
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

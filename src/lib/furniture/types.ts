import type { RoomId, Vec2 } from '@/lib/types';

export type FurnitureKind =
  | 'box'
  | 'counter'
  | 'appliance'
  | 'sofa'
  | 'armchair'
  | 'bed'
  | 'table'
  | 'chair'
  | 'stool'
  | 'bench'
  | 'rug'
  | 'panel'
  | 'tv'
  | 'mirror'
  | 'curtain'
  | 'floorLamp'
  | 'tableLamp'
  | 'pendant'
  | 'wallLight'
  | 'plant'
  | 'vase'
  | 'books'
  | 'shelf'
  | 'basin'
  | 'toilet'
  | 'showerGlass'
  | 'towels'
  | 'handrail';

export type FurnitureMaterialId =
  | 'wood'
  | 'woodDark'
  | 'fabric'
  | 'fabricDark'
  | 'leather'
  | 'stoneTop'
  | 'metal'
  | 'metalWarm'
  | 'glass'
  | 'screen'
  | 'plant'
  | 'ceramic'
  | 'appliance'
  | 'rug'
  | 'wetStone'
  | 'lampShade';

export interface FurnitureSize {
  w: number;
  d: number;
  h: number;
}

/**
 * `w` along local +x, `d` along local +z, `h` vertical; `rotationRad` turns
 * about y with 0 facing +z; `elevationM` lifts the underside off the floor.
 */
export interface FurniturePiece {
  id: string;
  roomId: RoomId;
  kind: FurnitureKind;
  position: Vec2;
  size: FurnitureSize;
  rotationRad?: number;
  elevationM?: number;
  materialId?: FurnitureMaterialId;
  blocking?: boolean;
  detail?: boolean;
  note?: string;
}

/**
 * Phase-1 furniture placements: a small, curated set of "hero" pieces per
 * room (not every noun in roomPrompts.ts's furniturePlan sentence), each
 * traceable to a real, currently-live retailer page via productUrl so a
 * visitor can actually shop the room they're standing in.
 *
 * Positions are world-space meters, the same frame as RoomDef.floorPolygon /
 * cameraSpawn. footprintM is the item's LOCAL (pre-rotation) extent: widthM
 * along local x, depthM along local z; rotationYRad then places it in the
 * world exactly like a wall panel (0 = local axes match world axes).
 *
 * mamad's items are deliberately kept clear of its protected door/window and
 * their clearances — see findMamadFurnitureObstructions in
 * src/lib/validation/houseValidation.ts, which checks this as a tested
 * invariant rather than just an authoring convention.
 */

import type { FurnitureItem, RoomId } from '@/lib/types';
import { PALETTE } from './materials';

export const furnitureByRoom: Partial<Record<RoomId, FurnitureItem[]>> = {
  living: [
    {
      id: 'living-sofa',
      roomId: 'living',
      kind: 'sofa',
      position: { x: 0.55, z: 2.7 },
      rotationYRad: Math.PI / 2,
      footprintM: { widthM: 2.2, depthM: 0.9 },
      heightM: 0.75,
      colorHex: PALETTE.taupe,
      shopLabel: 'Modular sofa',
      category: 'Sofa',
      retailer: 'IKEA',
      productUrl: 'https://www.ikea.com/us/en/cat/sofas-sectionals-fu003/',
    },
    {
      id: 'living-coffee-table',
      roomId: 'living',
      kind: 'coffee-table',
      position: { x: 1.3, z: 2.7 },
      rotationYRad: 0,
      footprintM: { widthM: 1.1, depthM: 0.6 },
      heightM: 0.38,
      colorHex: PALETTE.oak,
      shopLabel: 'Oak coffee table',
      category: 'Coffee table',
      retailer: 'IKEA',
      productUrl: 'https://www.ikea.com/us/en/cat/coffee-tables-10716/',
    },
    {
      id: 'living-rug',
      roomId: 'living',
      kind: 'rug',
      position: { x: 1.8, z: 2.6 },
      rotationYRad: 0,
      footprintM: { widthM: 2.6, depthM: 2.0 },
      heightM: 0.02,
      colorHex: PALETTE.limestone,
      shopLabel: 'Wool area rug',
      category: 'Rug',
      retailer: 'IKEA',
      productUrl: 'https://www.ikea.com/us/en/cat/rugs-10653/',
    },
  ],
  kitchen: [
    {
      id: 'kitchen-stool-1',
      roomId: 'kitchen',
      kind: 'counter-stool',
      position: { x: 1.0, z: 4.35 },
      rotationYRad: 0,
      footprintM: { widthM: 0.4, depthM: 0.4 },
      heightM: 0.75,
      colorHex: PALETTE.oak,
      shopLabel: 'Counter stool',
      category: 'Bar stool',
      retailer: 'IKEA',
      productUrl: 'https://www.ikea.com/us/en/cat/bar-stools-chairs-20864/',
    },
    {
      id: 'kitchen-stool-2',
      roomId: 'kitchen',
      kind: 'counter-stool',
      position: { x: 1.8, z: 4.35 },
      rotationYRad: 0,
      footprintM: { widthM: 0.4, depthM: 0.4 },
      heightM: 0.75,
      colorHex: PALETTE.oak,
      shopLabel: 'Counter stool',
      category: 'Bar stool',
      retailer: 'IKEA',
      productUrl: 'https://www.ikea.com/us/en/cat/bar-stools-chairs-20864/',
    },
  ],
  bathroom_main: [
    {
      id: 'bathmain-vanity',
      roomId: 'bathroom_main',
      kind: 'vanity',
      position: { x: 8.55, z: 5.5 },
      rotationYRad: -Math.PI / 2,
      footprintM: { widthM: 1.0, depthM: 0.45 },
      heightM: 0.15,
      colorHex: PALETTE.oak,
      shopLabel: 'Floating vanity unit',
      category: 'Bathroom vanity',
      retailer: 'IKEA',
      productUrl: 'https://www.ikea.com/us/en/cat/bathroom-vanities-20719/',
    },
  ],
  parents_bed: [
    {
      id: 'parents-bed',
      roomId: 'parents_bed',
      kind: 'bed',
      position: { x: 13.8, z: 7.55 },
      rotationYRad: 0,
      footprintM: { widthM: 1.8, depthM: 2.1 },
      heightM: 0.55,
      colorHex: PALETTE.ivory,
      shopLabel: 'Upholstered queen bed',
      category: 'Bed frame',
      retailer: 'IKEA',
      productUrl: 'https://www.ikea.com/us/en/cat/beds-bm003/',
    },
    {
      id: 'parents-nightstand',
      roomId: 'parents_bed',
      kind: 'nightstand',
      position: { x: 12.8, z: 6.7 },
      rotationYRad: 0,
      footprintM: { widthM: 0.45, depthM: 0.4 },
      heightM: 0.5,
      colorHex: PALETTE.oak,
      shopLabel: 'Oak nightstand',
      category: 'Nightstand',
      retailer: 'IKEA',
      productUrl: 'https://www.ikea.com/us/en/cat/nightstands-20656/',
    },
    {
      id: 'parents-wardrobe',
      roomId: 'parents_bed',
      kind: 'wardrobe',
      position: { x: 14.5, z: 9.5 },
      rotationYRad: Math.PI,
      footprintM: { widthM: 2.0, depthM: 0.6 },
      heightM: 2.1,
      colorHex: PALETTE.taupe,
      shopLabel: 'Fitted wardrobe',
      category: 'Wardrobe',
      retailer: 'IKEA',
      productUrl: 'https://www.ikea.com/us/en/cat/armoires-wardrobes-19053/',
    },
  ],
  mamad: [
    {
      id: 'mamad-bed',
      roomId: 'mamad',
      kind: 'bed',
      position: { x: 9.75, z: 2.05 },
      rotationYRad: -Math.PI / 2,
      footprintM: { widthM: 0.9, depthM: 2.0 },
      heightM: 0.5,
      colorHex: PALETTE.ivory,
      shopLabel: 'Sofa bed',
      category: 'Sofa bed',
      retailer: 'IKEA',
      productUrl: 'https://www.ikea.com/us/en/cat/sleeper-sofas-10663/',
    },
    {
      id: 'mamad-desk',
      roomId: 'mamad',
      kind: 'desk',
      position: { x: 8.0, z: 2.7 },
      rotationYRad: 0,
      footprintM: { widthM: 1.0, depthM: 0.5 },
      heightM: 0.73,
      colorHex: PALETTE.oak,
      shopLabel: 'Compact desk',
      category: 'Desk',
      retailer: 'IKEA',
      productUrl: 'https://www.ikea.com/us/en/cat/desks-for-home-20651/',
    },
    {
      id: 'mamad-storage',
      roomId: 'mamad',
      kind: 'wardrobe',
      position: { x: 7.7, z: 0.3 },
      rotationYRad: 0,
      footprintM: { widthM: 0.7, depthM: 0.4 },
      heightM: 1.0,
      colorHex: PALETTE.taupe,
      shopLabel: 'Closed storage cabinet',
      category: 'Storage cabinet',
      retailer: 'IKEA',
      productUrl: 'https://www.ikea.com/us/en/cat/storage-organization-st001/',
    },
  ],
};

export const allFurnitureItems: FurnitureItem[] = Object.values(furnitureByRoom).flat();

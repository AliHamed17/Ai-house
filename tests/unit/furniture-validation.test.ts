import { describe, expect, it } from 'vitest';
import { houseModel } from '@/data/house';
import { allFurnitureItems, furnitureByRoom } from '@/data/furniture';
import {
  findFurnitureBlockingCameraSpawn,
  findFurnitureMissingShopLink,
  findFurnitureOutsidePolygon,
  findMamadFurnitureObstructions,
} from '@/lib/validation/houseValidation';

describe('furniture placement validation', () => {
  it('has at least one furniture item for every phase-1 room', () => {
    const rooms = Object.keys(furnitureByRoom);
    expect(rooms).toEqual(expect.arrayContaining(['living', 'kitchen', 'bathroom_main', 'parents_bed', 'mamad']));
    for (const room of rooms) {
      expect(furnitureByRoom[room as keyof typeof furnitureByRoom]!.length).toBeGreaterThan(0);
    }
  });

  it('places every furniture item fully inside its own room floor polygon', () => {
    expect(findFurnitureOutsidePolygon(houseModel, allFurnitureItems)).toEqual([]);
  });

  it('keeps every MAMAD furniture item clear of the protected door/window clearance', () => {
    expect(findMamadFurnitureObstructions(houseModel, allFurnitureItems)).toEqual([]);
  });

  it('never places furniture directly on its own room\'s camera spawn point (regression)', () => {
    // Furniture isn't included in resolveCollision (collision.ts), so a
    // piece placed on the spawn point would spawn the visitor standing
    // inside it with nothing to correct that on entry.
    expect(findFurnitureBlockingCameraSpawn(houseModel, allFurnitureItems)).toEqual([]);
  });

  it('flags an item deliberately placed on top of its room\'s camera spawn', () => {
    const room = houseModel.rooms.find((r) => r.id === 'parents_bed')!;
    const intruder = {
      id: 'test-spawn-blocker',
      roomId: 'parents_bed' as const,
      kind: 'desk' as const,
      position: { x: room.cameraSpawn.x, z: room.cameraSpawn.z },
      rotationYRad: 0,
      footprintM: { widthM: 0.6, depthM: 0.4 },
      heightM: 0.5,
      colorHex: '#000000',
      shopLabel: 'test',
      category: 'test',
      retailer: 'test',
      productUrl: 'https://example.com',
    };
    expect(findFurnitureBlockingCameraSpawn(houseModel, [intruder])).toEqual(['test-spawn-blocker']);
  });

  it('does not flag a rug under the camera spawn — standing on a rug is normal', () => {
    const room = houseModel.rooms.find((r) => r.id === 'parents_bed')!;
    const rugUnderSpawn = {
      id: 'test-rug-under-spawn',
      roomId: 'parents_bed' as const,
      kind: 'rug' as const,
      position: { x: room.cameraSpawn.x, z: room.cameraSpawn.z },
      rotationYRad: 0,
      footprintM: { widthM: 2.0, depthM: 2.0 },
      heightM: 0.02,
      colorHex: '#000000',
      shopLabel: 'test',
      category: 'test',
      retailer: 'test',
      productUrl: 'https://example.com',
    };
    expect(findFurnitureBlockingCameraSpawn(houseModel, [rugUnderSpawn])).toEqual([]);
  });

  it('gives every furniture item a real, non-empty shop link', () => {
    expect(findFurnitureMissingShopLink(allFurnitureItems)).toEqual([]);
    for (const item of allFurnitureItems) {
      expect(item.productUrl).toMatch(/^https:\/\//);
    }
  });

  it('gives every furniture item a positive footprint and height', () => {
    for (const item of allFurnitureItems) {
      expect(item.footprintM.widthM).toBeGreaterThan(0);
      expect(item.footprintM.depthM).toBeGreaterThan(0);
      expect(item.heightM).toBeGreaterThan(0);
    }
  });

  it('references only rooms that exist in the house model', () => {
    const roomIds = new Set(houseModel.rooms.map((r) => r.id));
    for (const item of allFurnitureItems) {
      expect(roomIds.has(item.roomId)).toBe(true);
    }
  });

  it('flags a MAMAD item deliberately placed in front of the protected door', () => {
    const intruder = {
      id: 'test-intruder',
      roomId: 'mamad' as const,
      kind: 'desk' as const,
      position: { x: 7.6, z: 1.5 },
      rotationYRad: 0,
      footprintM: { widthM: 0.6, depthM: 0.4 },
      heightM: 0.5,
      colorHex: '#000000',
      shopLabel: 'test',
      category: 'test',
      retailer: 'test',
      productUrl: 'https://example.com',
    };
    expect(findMamadFurnitureObstructions(houseModel, [intruder])).toEqual(['test-intruder']);
  });

  it('flags an item placed outside its declared room polygon', () => {
    const outOfBounds = {
      id: 'test-outside',
      roomId: 'mamad' as const,
      kind: 'desk' as const,
      position: { x: 50, z: 50 },
      rotationYRad: 0,
      footprintM: { widthM: 0.6, depthM: 0.4 },
      heightM: 0.5,
      colorHex: '#000000',
      shopLabel: 'test',
      category: 'test',
      retailer: 'test',
      productUrl: 'https://example.com',
    };
    expect(findFurnitureOutsidePolygon(houseModel, [outOfBounds])).toEqual(['test-outside']);
  });
});

import { describe, expect, it } from 'vitest';
import { houseModel, ENTRY_ROOM_ID } from '@/data/house';
import { materialVariants } from '@/data/materials';
import {
  findAsymmetricAdjacency,
  findDuplicateRoomIds,
  findNonPositiveDimensions,
  findRoomsMissingConfidenceOrSource,
  findUnreachableRooms,
  validateHouse,
  validateMamadProtected,
} from '@/lib/validation/houseValidation';

describe('house model structural validation', () => {
  it('has no duplicate room ids', () => {
    expect(findDuplicateRoomIds(houseModel)).toEqual([]);
  });

  it('has fully symmetric adjacency', () => {
    expect(findAsymmetricAdjacency(houseModel)).toEqual([]);
  });

  it('is fully reachable from the entry room', () => {
    expect(findUnreachableRooms(houseModel, ENTRY_ROOM_ID)).toEqual([]);
  });

  it('has positive dimensions and ceiling heights for every room', () => {
    expect(findNonPositiveDimensions(houseModel)).toEqual([]);
  });

  it('records a confidence level and dimension source for every room', () => {
    expect(findRoomsMissingConfidenceOrSource(houseModel)).toEqual([]);
  });

  it('keeps the MAMAD protected room, door, and window intact', () => {
    const result = validateMamadProtected(houseModel);
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('keeps MAMAD protected under every material variant (variants never touch geometry)', () => {
    for (const variant of materialVariants) {
      // Material variants only carry color overrides; re-asserting here
      // documents that no variant id ever changes the protected opening set.
      expect(variant.floorOverrides).not.toHaveProperty('mamad');
      const result = validateMamadProtected(houseModel);
      expect(result.ok).toBe(true);
    }
  });

  it('passes the full validation report', () => {
    const report = validateHouse(houseModel, ENTRY_ROOM_ID);
    expect(report.ok).toBe(true);
  });

  it('every room has a unique stable id matching the RoomId union', () => {
    const ids = houseModel.rooms.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBeGreaterThanOrEqual(14);
  });

  it('every opening references at least one room that exists', () => {
    const roomIds = new Set(houseModel.rooms.map((r) => r.id));
    for (const opening of houseModel.openings) {
      const refs = [opening.roomA, opening.roomB, opening.roomId].filter(Boolean) as string[];
      expect(refs.length).toBeGreaterThan(0);
      for (const ref of refs) {
        if (ref === 'exterior') continue;
        expect(roomIds.has(ref as never)).toBe(true);
      }
    }
  });
});

import { describe, expect, it } from 'vitest';
import { doorHotspotsFrom, NAVIGABLE_OPENING_KINDS } from '@/lib/geometry/doorHotspots';
import { houseModel, roomById } from '@/data/house';
import type { OpeningDef, RoomId } from '@/lib/types';

function opening(partial: Partial<OpeningDef> & Pick<OpeningDef, 'id' | 'kind'>): OpeningDef {
  return {
    position: { x: 0, z: 0 },
    widthM: 1,
    sillM: 0,
    headM: 2.1,
    confidence: 'medium',
    ...partial,
  } as OpeningDef;
}

describe('door hotspots', () => {
  it('offers the far side of an opening the visitor is standing at', () => {
    const openings = [opening({ id: 'a', kind: 'door', roomA: 'living', roomB: 'kitchen' })];
    expect(doorHotspotsFrom('living', openings)).toEqual([
      { opening: openings[0], destinationRoomId: 'kitchen' },
    ]);
    expect(doorHotspotsFrom('kitchen', openings)).toEqual([
      { opening: openings[0], destinationRoomId: 'living' },
    ]);
  });

  // The finding: rendering every opening in the house and computing the far
  // side with `roomA === active ? roomB : roomA` answered roomA whenever the
  // visitor was in NEITHER room.
  it('offers nothing for an opening the visitor is not standing at', () => {
    const openings = [opening({ id: 'a', kind: 'door', roomA: 'kitchen', roomB: 'dining' })];
    expect(doorHotspotsFrom('living', openings)).toEqual([]);
  });

  it('skips windows and anything else not walkable', () => {
    const openings = [
      opening({ id: 'w', kind: 'window', roomA: 'living', roomB: 'kitchen' }),
      opening({ id: 'd', kind: 'door', roomA: 'living', roomB: 'kitchen' }),
    ];
    expect(doorHotspotsFrom('living', openings).map((h) => h.opening.id)).toEqual(['d']);
  });

  it('skips an opening missing either side', () => {
    const openings = [
      opening({ id: 'a', kind: 'door', roomA: 'living' }),
      opening({ id: 'b', kind: 'door', roomB: 'living' }),
    ];
    expect(doorHotspotsFrom('living', openings)).toEqual([]);
  });

  it('skips an opening onto the exterior, which is no room to arrive in', () => {
    const openings = [opening({ id: 'a', kind: 'exterior_opening', roomA: 'living', roomB: 'exterior' })];
    expect(doorHotspotsFrom('living', openings)).toEqual([]);
  });

  it('covers every navigable kind', () => {
    for (const kind of NAVIGABLE_OPENING_KINDS) {
      const openings = [opening({ id: kind, kind: kind as OpeningDef['kind'], roomA: 'living', roomB: 'kitchen' })];
      expect(doorHotspotsFrom('living', openings)).toHaveLength(1);
    }
  });
});

describe('door hotspots against the real house', () => {
  // The open social zone is why this is a real bug and not a theoretical
  // one: living, kitchen, dining and the terrace have no dividing walls, so
  // markers for openings that do not touch the living room are in plain
  // sight from it — and used to be clickable.
  it('does not offer the kitchen-dining or dining-terrace markers from the living room', () => {
    const ids = doorHotspotsFrom('living', houseModel.openings).map((h) => h.opening.id);
    expect(ids).not.toContain('opening_kitchen_dining');
    expect(ids).not.toContain('exterior_opening_dining_terrace');
    expect(ids).toContain('opening_living_kitchen');
    expect(ids).toContain('opening_living_dining');
  });

  it('never returns a hotspot whose opening does not touch the room asked about', () => {
    for (const roomId of roomById.keys()) {
      for (const { opening: o } of doorHotspotsFrom(roomId, houseModel.openings)) {
        expect([o.roomA, o.roomB]).toContain(roomId);
      }
    }
  });

  it('always lands the visitor on the other side of the opening they clicked', () => {
    for (const roomId of roomById.keys()) {
      for (const { opening: o, destinationRoomId } of doorHotspotsFrom(roomId, houseModel.openings)) {
        expect(destinationRoomId).not.toBe(roomId);
        expect([o.roomA, o.roomB]).toContain(destinationRoomId);
        // And it is a room that actually exists, so the marker can render.
        expect(roomById.has(destinationRoomId)).toBe(true);
      }
    }
  });

  it('still offers a way out of every room in the house', () => {
    const roomsWithNoExit: RoomId[] = [];
    for (const roomId of roomById.keys()) {
      if (doorHotspotsFrom(roomId, houseModel.openings).length === 0) roomsWithNoExit.push(roomId);
    }
    expect(roomsWithNoExit).toEqual([]);
  });

  it("offers MAMAD's one protected door from inside it", () => {
    const ids = doorHotspotsFrom('mamad', houseModel.openings).map((h) => h.opening.id);
    expect(ids).toContain('door_entry_mamad');
  });
});

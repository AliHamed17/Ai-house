import { houseModel } from '@/data/house';
import type { RoomId } from '@/lib/types';

export const JOURNEY_ORDER: RoomId[] = [
  'stair_landing',
  'entry_hall',
  'living',
  'kitchen',
  'dining',
  'terrace_nw',
  'corridor',
  'mamad',
  'bedroom_twin',
  'bedroom_parents',
  'bath_family',
  'wc',
];

export interface JourneyLayer {
  roomId: RoomId;
  index: number;
  opacity: number;
  scale: number;
  parallax: number;
}

export interface JourneySample {
  position: number;
  activeIndex: number;
  activeRoomId: RoomId;
  layers: JourneyLayer[];
}

export const JOURNEY_ROOM_COUNT = JOURNEY_ORDER.length;

function clamp01(n: number): number {
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

/**
 * Cosine ease so adjacent stills cross-fade without the muddy midpoint a
 * linear blend gives, and without either layer ever hitting exact zero early.
 */
function fade(distance: number): number {
  const d = Math.abs(distance);
  if (d >= 1) return 0;
  return (Math.cos(d * Math.PI) + 1) / 2;
}

export function sampleJourney(progress: number, roomCount: number = JOURNEY_ROOM_COUNT): JourneySample {
  const count = Math.max(1, roomCount);
  const position = clamp01(progress) * (count - 1);
  const activeIndex = Math.min(count - 1, Math.max(0, Math.round(position)));

  const layers: JourneyLayer[] = [];
  for (let i = Math.floor(position) - 1; i <= Math.ceil(position) + 1; i += 1) {
    if (i < 0 || i >= count) continue;
    const distance = position - i;
    const opacity = fade(distance);
    if (opacity <= 0.001) continue;
    layers.push({
      roomId: JOURNEY_ORDER[i] ?? JOURNEY_ORDER[0],
      index: i,
      opacity,
      scale: 1.06 - 0.06 * clamp01(1 - Math.abs(distance)),
      parallax: distance * -18,
    });
  }

  return {
    position,
    activeIndex,
    activeRoomId: JOURNEY_ORDER[activeIndex] ?? JOURNEY_ORDER[0],
    layers: layers.sort((a, b) => a.opacity - b.opacity),
  };
}

export function journeyRooms() {
  return JOURNEY_ORDER.map((id) => {
    const room = houseModel.rooms.find((r) => r.id === id);
    if (!room) throw new Error(`JOURNEY_ORDER references unknown room "${id}"`);
    return room;
  });
}

import type { OpeningDef, RoomId } from '@/lib/types';

/** Openings a visitor can actually pass through, as opposed to windows. */
export const NAVIGABLE_OPENING_KINDS: ReadonlySet<string> = new Set([
  'door',
  'open_threshold',
  'exterior_opening',
]);

export interface DoorHotspot {
  opening: OpeningDef;
  /** The room on the far side of it from where the visitor is standing. */
  destinationRoomId: RoomId;
}

/**
 * The door markers to show a visitor standing in `activeRoomId`, each with an
 * unambiguous destination.
 *
 * A marker means "a way out of the room I am in", so only openings that
 * actually touch that room get one. Rendering every opening in the house and
 * working out the far side with `roomA === active ? roomB : roomA` silently
 * answered `roomA` whenever the visitor was in NEITHER room — and in this
 * house that is reachable on foot, not a theoretical case: living, kitchen,
 * dining and the terrace form one open social zone with no dividing walls,
 * so from the living room the kitchen–dining and dining–terrace markers are
 * both in plain sight and clickable, and each would have teleported to
 * whichever side happened to be written first in the model.
 *
 * Deriving destination and visibility from the same adjacency check makes
 * that unrepresentable: a hotspot only exists when the visitor is on one of
 * its two sides, so the other side is always the one they meant.
 *
 * Openings onto 'exterior' are skipped — there is no room to arrive in.
 */
export function doorHotspotsFrom(
  activeRoomId: RoomId,
  openings: readonly OpeningDef[],
): DoorHotspot[] {
  const hotspots: DoorHotspot[] = [];
  for (const opening of openings) {
    if (!NAVIGABLE_OPENING_KINDS.has(opening.kind)) continue;
    const { roomA, roomB } = opening;
    if (!roomA || !roomB) continue;

    let destination: RoomId | 'exterior';
    if (roomA === activeRoomId) destination = roomB;
    else if (roomB === activeRoomId) destination = roomA;
    else continue;

    if (destination === 'exterior') continue;
    hotspots.push({ opening, destinationRoomId: destination });
  }
  return hotspots;
}

import type { RoomId } from '@/lib/types';
import manifest from '../../public/generated/concepts/manifest.json';

/**
 * Rooms for which a REAL Nano Banana render (`<room>.png`) has been generated
 * by `scripts/generate-concepts.py` and committed. The manifest is empty until
 * that script runs with valid Gemini credentials; every other room falls back
 * to its clearly-labeled placeholder SVG. This lets the site upgrade from
 * placeholders to real cinematic concepts with no code change — just re-run
 * the generator and the committed manifest picks them up.
 */
const generatedRooms = new Set<RoomId>((manifest.generatedRooms as RoomId[]) ?? []);

export function hasRealConcept(roomId: RoomId): boolean {
  return generatedRooms.has(roomId);
}

/** Site-relative path to the best available concept image for a room. */
export function conceptAssetPath(roomId: RoomId): string {
  return generatedRooms.has(roomId)
    ? `/generated/concepts/${roomId}.png`
    : `/generated/concepts/${roomId}.svg`;
}

/**
 * The shortlist: pieces a visitor has saved while walking the house, so the
 * shoppable furniture hotspots add up to something they can actually take
 * away and order from rather than a link they have to re-find by walking
 * back to the same corner of the same room.
 *
 * This module is the pure half — validation, grouping, and the plain-text
 * export. The store half (src/lib/store/shortlistStore.ts) owns the React
 * state and its localStorage mirror.
 *
 * A saved entry is only ever a furniture id. Everything shown about a piece
 * (its label, retailer, and — crucially — its productUrl) is looked up fresh
 * from src/data/furniture.ts at render time, so a stored list can never
 * resurrect a stale price, a renamed piece, or a retailer URL that has since
 * been corrected in the catalogue. It also bounds the list by construction:
 * unknown ids are dropped on read, so a hand-edited localStorage entry cannot
 * grow the list past the catalogue or inject a URL of its own.
 */

import { allFurnitureItems } from '@/data/furniture';
import { getRoom } from '@/data/house';
import type { FurnitureItem, RoomId } from '@/lib/types';

export const SHORTLIST_STORAGE_KEY = 'ai-house:shortlist:v1';

const itemsById = new Map<string, FurnitureItem>(allFurnitureItems.map((item) => [item.id, item]));

/** Whether an id names a piece that still exists in the catalogue. */
export function isKnownFurnitureId(id: string): boolean {
  return itemsById.has(id);
}

/**
 * Reads a stored shortlist. A same-origin localStorage value can be null, a
 * since-changed shape, or a hand-edited array of anything at all, and none of
 * those throw on JSON.parse — so the result is filtered down to known ids and
 * de-duplicated, preserving the order pieces were saved in.
 */
export function parseStoredShortlist(raw: string | null): string[] {
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const value of parsed) {
    if (typeof value !== 'string' || seen.has(value) || !isKnownFurnitureId(value)) continue;
    seen.add(value);
    ids.push(value);
  }
  return ids;
}

/** The saved pieces themselves, in save order, skipping ids we can't resolve. */
export function resolveShortlistItems(ids: readonly string[]): FurnitureItem[] {
  const items: FurnitureItem[] = [];
  for (const id of ids) {
    const item = itemsById.get(id);
    if (item) items.push(item);
  }
  return items;
}

export interface ShortlistRoomGroup {
  roomId: RoomId;
  roomName: string;
  items: FurnitureItem[];
}

/**
 * Saved pieces grouped by the room they stand in. Rooms appear in the order
 * their first saved piece was saved, so the list reads as a record of the
 * walk rather than being re-sorted under the visitor on every save.
 */
export function groupShortlistByRoom(ids: readonly string[]): ShortlistRoomGroup[] {
  const groups = new Map<RoomId, ShortlistRoomGroup>();
  for (const item of resolveShortlistItems(ids)) {
    let group = groups.get(item.roomId);
    if (!group) {
      group = {
        roomId: item.roomId,
        // A piece always belongs to a real room, but the catalogue and the
        // house model are separate files: fall back to the id rather than
        // rendering "undefined" if they ever drift.
        roomName: getRoom(item.roomId)?.nameEn ?? item.roomId,
        items: [],
      };
      groups.set(item.roomId, group);
    }
    group.items.push(item);
  }
  return [...groups.values()];
}

/**
 * The shortlist as plain text, for the clipboard. Plain text rather than
 * markdown or CSV because the destination is usually a notes app or a message
 * to whoever is doing the ordering, and every line has to survive that intact
 * — including the URL, which is why each one gets a line of its own.
 */
export function formatShortlistAsText(ids: readonly string[]): string {
  const groups = groupShortlistByRoom(ids);
  if (groups.length === 0) return 'Saved pieces — none yet.';

  const lines: string[] = ['Saved pieces from the 3D house', ''];
  for (const group of groups) {
    lines.push(`${group.roomName}`);
    for (const item of group.items) {
      lines.push(`  - ${item.shopLabel} (${item.category}) — ${item.retailer}`);
      lines.push(`    ${item.productUrl}`);
    }
    lines.push('');
  }
  // One trailing blank line from the last group; drop it so the text ends on
  // content and pastes cleanly.
  return lines.slice(0, -1).join('\n');
}

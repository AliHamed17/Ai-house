import { describe, expect, it } from 'vitest';
import {
  formatShortlistAsText,
  groupShortlistByRoom,
  isKnownFurnitureId,
  parseStoredShortlist,
  resolveShortlistItems,
} from '@/lib/shortlist';
import { allFurnitureItems } from '@/data/furniture';
import { getRoom } from '@/data/house';

const [first, second] = allFurnitureItems;
const otherRoomItem = allFurnitureItems.find((i) => i.roomId !== first.roomId);

describe('shortlist storage parsing', () => {
  it('returns an empty list for missing or unusable storage', () => {
    expect(parseStoredShortlist(null)).toEqual([]);
    expect(parseStoredShortlist('')).toEqual([]);
    expect(parseStoredShortlist('not json')).toEqual([]);
    expect(parseStoredShortlist('{"id":"living-sofa"}')).toEqual([]);
    expect(parseStoredShortlist('"living-sofa"')).toEqual([]);
  });

  it('keeps known ids in the order they were saved', () => {
    expect(parseStoredShortlist(JSON.stringify([second.id, first.id]))).toEqual([second.id, first.id]);
  });

  // A hand-edited localStorage entry is the only way these appear, and it is
  // also how someone would try to inject a URL of their own: unknown ids are
  // the boundary that stops it, since every rendered link is looked up from
  // the catalogue by id rather than read from storage.
  it('drops ids that name no piece in the catalogue', () => {
    expect(parseStoredShortlist(JSON.stringify(['nope', first.id, 'https://evil.example']))).toEqual([first.id]);
  });

  it('drops non-string entries', () => {
    expect(parseStoredShortlist(JSON.stringify([1, null, { id: first.id }, first.id]))).toEqual([first.id]);
  });

  it('de-duplicates', () => {
    expect(parseStoredShortlist(JSON.stringify([first.id, first.id, second.id, first.id]))).toEqual([
      first.id,
      second.id,
    ]);
  });

  it('recognises every id the catalogue actually ships', () => {
    for (const item of allFurnitureItems) expect(isKnownFurnitureId(item.id)).toBe(true);
    expect(isKnownFurnitureId('definitely-not-a-piece')).toBe(false);
  });
});

describe('shortlist resolution', () => {
  it('resolves ids to the live catalogue entry, not a stored copy', () => {
    const [resolved] = resolveShortlistItems([first.id]);
    expect(resolved).toBe(first);
    expect(resolved.productUrl).toBe(first.productUrl);
  });

  it('skips ids it cannot resolve instead of emitting holes', () => {
    expect(resolveShortlistItems(['gone', first.id]).map((i) => i.id)).toEqual([first.id]);
  });

  it('groups by room, in the order rooms were first saved from', () => {
    expect(otherRoomItem).toBeDefined();
    const groups = groupShortlistByRoom([otherRoomItem!.id, first.id]);
    expect(groups.map((g) => g.roomId)).toEqual([otherRoomItem!.roomId, first.roomId]);
    expect(groups[0].roomName).toBe(getRoom(otherRoomItem!.roomId)?.nameEn);
  });

  it('collects several pieces from one room into a single group', () => {
    const sameRoom = allFurnitureItems.filter((i) => i.roomId === first.roomId).slice(0, 2);
    expect(sameRoom.length).toBeGreaterThan(1);
    const groups = groupShortlistByRoom(sameRoom.map((i) => i.id));
    expect(groups).toHaveLength(1);
    expect(groups[0].items.map((i) => i.id)).toEqual(sameRoom.map((i) => i.id));
  });
});

describe('shortlist export text', () => {
  it('says so plainly when nothing is saved', () => {
    expect(formatShortlistAsText([])).toContain('none yet');
  });

  it('carries every saved piece and its real URL on its own line', () => {
    const text = formatShortlistAsText([first.id]);
    expect(text).toContain(first.shopLabel);
    expect(text).toContain(first.retailer);
    const urlLine = text.split('\n').find((line) => line.includes(first.productUrl));
    expect(urlLine?.trim()).toBe(first.productUrl);
  });

  it('heads each room with its name', () => {
    const text = formatShortlistAsText([first.id]);
    expect(text).toContain(getRoom(first.roomId)!.nameEn);
  });

  it('ends on content rather than a trailing blank line', () => {
    const text = formatShortlistAsText([first.id, second.id]);
    expect(text.endsWith('\n')).toBe(false);
    expect(text.trimEnd()).toBe(text);
  });
});

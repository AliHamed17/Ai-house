'use client';

import { create } from 'zustand';
import { SHORTLIST_STORAGE_KEY, isKnownFurnitureId, parseStoredShortlist } from '@/lib/shortlist';

/**
 * The saved-pieces shortlist and its localStorage mirror.
 *
 * Two rules this store exists to enforce:
 *
 * 1. `applyChange` is the SINGLE writer for both the React state and the
 *    stored record. Nothing else in the app writes SHORTLIST_STORAGE_KEY, so
 *    the two can never be left disagreeing — the same discipline the AI
 *    studio's approved-source record is held to.
 *
 * 2. Every change is a read-modify-write against what is actually in storage
 *    right now, not against this tab's snapshot of it. localStorage is shared
 *    by every tab on the origin and offers no atomic read-modify-write, so a
 *    second tab that has been open since before those saves would otherwise
 *    overwrite them wholesale the first time its visitor saved anything.
 *    Re-reading first narrows that to the genuinely concurrent case.
 *
 * The store deliberately starts EMPTY and is filled by `hydrate()` from an
 * effect. Reading storage while building the store would run during the
 * server render, where it does not exist, and would make the first client
 * render disagree with the server's HTML.
 */
interface ShortlistState {
  ids: string[];
  /** True once storage has been consulted; until then "empty" means "unknown". */
  hydrated: boolean;
  hydrate: () => void;
  toggle: (id: string) => void;
  remove: (id: string) => void;
  clear: () => void;
}

function readStoredIds(): string[] | null {
  try {
    return parseStoredShortlist(localStorage.getItem(SHORTLIST_STORAGE_KEY));
  } catch {
    // Best-effort (private browsing, storage disabled) — the in-memory list
    // still works for as long as the tab stays open.
    return null;
  }
}

function writeStoredIds(ids: readonly string[]): void {
  try {
    if (ids.length > 0) localStorage.setItem(SHORTLIST_STORAGE_KEY, JSON.stringify(ids));
    // An empty list is a removal, not an empty array on disk: it leaves
    // nothing behind for the next visit to have to parse and discard.
    else localStorage.removeItem(SHORTLIST_STORAGE_KEY);
  } catch {
    // Best-effort, as above.
  }
}

export const useShortlistStore = create<ShortlistState>((set, get) => {
  /**
   * The single writer. `change` is applied to the freshly-read stored list
   * (falling back to this tab's list when storage is unavailable), and the
   * result becomes both the new state and the new stored record.
   */
  const applyChange = (change: (ids: string[]) => string[]) => {
    const base = readStoredIds() ?? get().ids;
    const next = change([...base]);
    writeStoredIds(next);
    set({ ids: next, hydrated: true });
  };

  return {
    ids: [],
    hydrated: false,

    hydrate: () => {
      if (get().hydrated) return;
      // Anything saved before this ran (only possible if a visitor beat the
      // mount effect to a click) is kept, not dropped: the stored list comes
      // first, then this tab's own additions.
      applyChange((stored) => {
        const pending = get().ids.filter((id) => !stored.includes(id));
        return [...stored, ...pending];
      });
    },

    toggle: (id) => {
      if (!isKnownFurnitureId(id)) return;
      applyChange((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
    },

    remove: (id) => applyChange((ids) => ids.filter((x) => x !== id)),

    clear: () => applyChange(() => []),
  };
});

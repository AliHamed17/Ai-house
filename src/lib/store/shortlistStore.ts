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
  /**
   * Whether the stored record is still known to match this list — i.e. the
   * last write landed. Internal bookkeeping rather than anything the UI
   * reads, but it lives in the store so a test can reset it with the rest of
   * the state. See `applyChange` for why a failed write has to change where
   * the next change is computed from.
   */
  storageHoldsList: boolean;
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

/** Returns whether the stored record now matches `ids`. */
function writeStoredIds(ids: readonly string[]): boolean {
  try {
    if (ids.length > 0) localStorage.setItem(SHORTLIST_STORAGE_KEY, JSON.stringify(ids));
    // An empty list is a removal, not an empty array on disk: it leaves
    // nothing behind for the next visit to have to parse and discard.
    else localStorage.removeItem(SHORTLIST_STORAGE_KEY);
    return true;
  } catch {
    // Best-effort (quota exhausted, storage disabled) — reported rather than
    // swallowed, because the caller has to know the stored record is now
    // behind this list.
    return false;
  }
}

export const useShortlistStore = create<ShortlistState>((set, get) => {
  /**
   * The single writer. `change` is applied to the freshly-read stored list
   * and the result becomes both the new state and the new stored record.
   *
   * Reading first is what stops a second tab's saves being clobbered. But it
   * is only correct while the stored record actually matches this list: if a
   * write has failed (quota exhausted, or a browser that permits reads and
   * refuses writes), storage is a snapshot from BEFORE the last change, and
   * computing the next change against it would silently drop that change —
   * two saves in a row would leave only the second. So a failed write
   * switches the base to this tab's own list, and a later successful write
   * (storage having recovered) switches it back.
   */
  const applyChange = (change: (ids: string[]) => string[]) => {
    const stored = get().storageHoldsList ? readStoredIds() : null;
    const base = stored ?? get().ids;
    const next = change([...base]);
    set({ ids: next, hydrated: true, storageHoldsList: writeStoredIds(next) });
  };

  return {
    ids: [],
    hydrated: false,
    storageHoldsList: true,

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
      // Which way to toggle is decided by what THIS tab is showing, because
      // that is what the visitor read off the button before clicking it. Were
      // it decided by the freshly-read stored list instead, a piece saved in
      // another tab — and so still offered here as "+ Save" — would be
      // REMOVED by a click asking to save it, and vice versa.
      //
      // The intent is then applied idempotently to the latest stored list, so
      // it still cannot clobber that other tab's work: saving something
      // already saved leaves the list alone, and removing something already
      // gone is a no-op. Either way the visitor gets the action they asked
      // for, and the panel agrees with storage from the next render on.
      const shouldSave = !get().ids.includes(id);
      applyChange((ids) => {
        if (!shouldSave) return ids.filter((x) => x !== id);
        return ids.includes(id) ? ids : [...ids, id];
      });
    },

    remove: (id) => applyChange((ids) => ids.filter((x) => x !== id)),

    clear: () => applyChange(() => []),
  };
});

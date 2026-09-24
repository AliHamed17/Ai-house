import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useShortlistStore } from '@/lib/store/shortlistStore';
import { SHORTLIST_STORAGE_KEY } from '@/lib/shortlist';
import { allFurnitureItems } from '@/data/furniture';

const [a, b, c] = allFurnitureItems;

function stored(): string[] | null {
  const raw = localStorage.getItem(SHORTLIST_STORAGE_KEY);
  return raw === null ? null : (JSON.parse(raw) as string[]);
}

beforeEach(() => {
  localStorage.clear();
  useShortlistStore.setState({ ids: [], hydrated: false, storageHoldsList: true });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('shortlist store', () => {
  it('saves a piece to both the state and the stored record', () => {
    useShortlistStore.getState().toggle(a.id);
    expect(useShortlistStore.getState().ids).toEqual([a.id]);
    expect(stored()).toEqual([a.id]);
  });

  it('toggles a saved piece back off', () => {
    useShortlistStore.getState().toggle(a.id);
    useShortlistStore.getState().toggle(a.id);
    expect(useShortlistStore.getState().ids).toEqual([]);
  });

  // An empty list is a removal, so the next visit has nothing to parse and
  // discard — and so state and storage agree on "nothing saved" rather than
  // one saying empty-array and the other saying absent.
  it('removes the stored record entirely when the list empties', () => {
    useShortlistStore.getState().toggle(a.id);
    useShortlistStore.getState().toggle(a.id);
    expect(localStorage.getItem(SHORTLIST_STORAGE_KEY)).toBeNull();
  });

  it('refuses ids that name no piece in the catalogue', () => {
    useShortlistStore.getState().toggle('not-a-piece');
    expect(useShortlistStore.getState().ids).toEqual([]);
    expect(localStorage.getItem(SHORTLIST_STORAGE_KEY)).toBeNull();
  });

  it('clear empties both halves at once', () => {
    useShortlistStore.getState().toggle(a.id);
    useShortlistStore.getState().toggle(b.id);
    useShortlistStore.getState().clear();
    expect(useShortlistStore.getState().ids).toEqual([]);
    expect(localStorage.getItem(SHORTLIST_STORAGE_KEY)).toBeNull();
  });

  it('remove takes one piece out and leaves the rest', () => {
    useShortlistStore.getState().toggle(a.id);
    useShortlistStore.getState().toggle(b.id);
    useShortlistStore.getState().remove(a.id);
    expect(useShortlistStore.getState().ids).toEqual([b.id]);
    expect(stored()).toEqual([b.id]);
  });
});

describe('shortlist hydration', () => {
  it('loads a stored list and marks itself hydrated', () => {
    localStorage.setItem(SHORTLIST_STORAGE_KEY, JSON.stringify([b.id, a.id]));
    useShortlistStore.getState().hydrate();
    expect(useShortlistStore.getState().ids).toEqual([b.id, a.id]);
    expect(useShortlistStore.getState().hydrated).toBe(true);
  });

  it('drops unknown ids as it loads', () => {
    localStorage.setItem(SHORTLIST_STORAGE_KEY, JSON.stringify(['ghost', a.id]));
    useShortlistStore.getState().hydrate();
    expect(useShortlistStore.getState().ids).toEqual([a.id]);
  });

  it('does nothing on a second call, so a later mount cannot undo a removal', () => {
    localStorage.setItem(SHORTLIST_STORAGE_KEY, JSON.stringify([a.id]));
    useShortlistStore.getState().hydrate();
    useShortlistStore.getState().toggle(a.id);
    useShortlistStore.getState().hydrate();
    expect(useShortlistStore.getState().ids).toEqual([]);
  });

  // Only reachable if a visitor beats the mount effect to a click, but a
  // hydrate that overwrote rather than merged would silently eat that save.
  it('keeps pieces saved before it ran', () => {
    localStorage.setItem(SHORTLIST_STORAGE_KEY, JSON.stringify([a.id]));
    useShortlistStore.setState({ ids: [b.id], hydrated: false, storageHoldsList: true });
    useShortlistStore.getState().hydrate();
    expect(useShortlistStore.getState().ids).toEqual([a.id, b.id]);
  });
});

describe('shortlist concurrency', () => {
  // localStorage is shared by every tab on the origin and has no atomic
  // read-modify-write. A store that wrote its own snapshot would erase what
  // another tab saved in the meantime; every change re-reads first instead.
  it('does not clobber a save made by another tab', () => {
    useShortlistStore.getState().hydrate();
    useShortlistStore.getState().toggle(a.id);

    // Another tab, sharing this origin, saves something of its own.
    localStorage.setItem(SHORTLIST_STORAGE_KEY, JSON.stringify([a.id, c.id]));

    useShortlistStore.getState().toggle(b.id);
    expect(stored()).toEqual([a.id, c.id, b.id]);
    expect(useShortlistStore.getState().ids).toEqual([a.id, c.id, b.id]);
  });

  it('applies a removal against what is actually stored', () => {
    useShortlistStore.getState().toggle(a.id);
    localStorage.setItem(SHORTLIST_STORAGE_KEY, JSON.stringify([a.id, c.id]));
    useShortlistStore.getState().remove(a.id);
    expect(stored()).toEqual([c.id]);
  });

  // Which way a click toggles must follow the button the visitor actually
  // read, not the stored list they cannot see. Deciding from storage would
  // make "+ Save" remove the piece — the exact opposite of what it offers.
  it('saves a piece another tab already saved, instead of removing it', () => {
    useShortlistStore.getState().hydrate();
    localStorage.setItem(SHORTLIST_STORAGE_KEY, JSON.stringify([a.id]));

    // This tab still shows nothing saved, so its button still offers Save.
    expect(useShortlistStore.getState().ids).toEqual([]);
    useShortlistStore.getState().toggle(a.id);

    expect(useShortlistStore.getState().ids).toEqual([a.id]);
    expect(stored()).toEqual([a.id]);
  });

  it('removes a piece another tab already removed, instead of re-adding it', () => {
    useShortlistStore.getState().toggle(a.id);
    localStorage.removeItem(SHORTLIST_STORAGE_KEY);

    // This tab still shows it saved, so its button still offers Saved/undo.
    useShortlistStore.getState().toggle(a.id);

    expect(useShortlistStore.getState().ids).toEqual([]);
    expect(localStorage.getItem(SHORTLIST_STORAGE_KEY)).toBeNull();
  });

  it('saving a piece already stored does not duplicate it or drop its siblings', () => {
    useShortlistStore.getState().hydrate();
    localStorage.setItem(SHORTLIST_STORAGE_KEY, JSON.stringify([c.id, a.id]));
    useShortlistStore.getState().toggle(a.id);
    expect(stored()).toEqual([c.id, a.id]);
  });
});

describe('shortlist without storage', () => {
  it('still tracks saves in memory when writing throws', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('storage disabled');
    });
    useShortlistStore.getState().toggle(a.id);
    expect(useShortlistStore.getState().ids).toEqual([a.id]);
  });

  // The dangerous shape is a browser that lets reads through and refuses
  // writes — an exhausted quota, typically. Storage then answers with a
  // snapshot from before the failed write, and a second save computed
  // against it would silently drop the first. (One toggle cannot catch
  // this; it takes two.)
  it('does not lose an earlier save when writes fail but reads still work', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded');
    });
    useShortlistStore.getState().toggle(a.id);
    useShortlistStore.getState().toggle(b.id);
    expect(useShortlistStore.getState().ids).toEqual([a.id, b.id]);
  });

  it('keeps every save across a whole run of failed writes', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded');
    });
    useShortlistStore.getState().toggle(a.id);
    useShortlistStore.getState().toggle(b.id);
    useShortlistStore.getState().toggle(c.id);
    useShortlistStore.getState().remove(b.id);
    expect(useShortlistStore.getState().ids).toEqual([a.id, c.id]);
  });

  // Storage coming back is not a reason to keep ignoring it: once a write
  // lands, the stored record matches again and is the right base once more.
  it('trusts storage again once a write succeeds', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => {
      throw new Error('quota exceeded');
    });
    useShortlistStore.getState().toggle(a.id);
    expect(useShortlistStore.getState().storageHoldsList).toBe(false);

    useShortlistStore.getState().toggle(b.id);
    expect(useShortlistStore.getState().storageHoldsList).toBe(true);
    expect(stored()).toEqual([a.id, b.id]);

    // A concurrent save from another tab is honoured again from here on.
    setItem.mockRestore();
    localStorage.setItem(SHORTLIST_STORAGE_KEY, JSON.stringify([a.id, b.id, c.id]));
    useShortlistStore.getState().remove(a.id);
    expect(stored()).toEqual([b.id, c.id]);
  });

  it('still tracks saves in memory when reading throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage disabled');
    });
    useShortlistStore.getState().toggle(a.id);
    useShortlistStore.getState().toggle(b.id);
    expect(useShortlistStore.getState().ids).toEqual([a.id, b.id]);
  });
});

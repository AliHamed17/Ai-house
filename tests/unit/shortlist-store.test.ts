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
  useShortlistStore.setState({ ids: [], hydrated: false });
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
    useShortlistStore.setState({ ids: [b.id], hydrated: false });
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
});

describe('shortlist without storage', () => {
  it('still tracks saves in memory when writing throws', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('storage disabled');
    });
    useShortlistStore.getState().toggle(a.id);
    expect(useShortlistStore.getState().ids).toEqual([a.id]);
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

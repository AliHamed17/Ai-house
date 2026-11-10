import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import { usePointerLockRelease } from '@/lib/usePointerLockRelease';

/**
 * First-person mode locks the pointer on any mouse press on the canvas. That
 * is right for looking around and wrong the moment a press opens an in-scene
 * popover: under Pointer Lock the cursor is hidden and every mouse event
 * stays aimed at the canvas, so the popover's "Shop this" link and its Save
 * button cannot be reached at all.
 */

function Harness({ active }: { active: boolean }) {
  usePointerLockRelease(active);
  return null;
}

let exitPointerLock: ReturnType<typeof vi.fn>;

/** Stands in for a locked document, since jsdom implements neither side. */
function setLockedElement(el: Element | null) {
  Object.defineProperty(document, 'pointerLockElement', { value: el, configurable: true });
}

beforeEach(() => {
  exitPointerLock = vi.fn(() => setLockedElement(null));
  Object.defineProperty(document, 'exitPointerLock', { value: exitPointerLock, configurable: true });
  setLockedElement(null);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('usePointerLockRelease', () => {
  it('releases a lock that is already held when it becomes active', () => {
    setLockedElement(document.createElement('canvas'));
    render(<Harness active />);
    expect(exitPointerLock).toHaveBeenCalledTimes(1);
  });

  it('does nothing while inactive, so ordinary walking still locks', () => {
    setLockedElement(document.createElement('canvas'));
    render(<Harness active={false} />);
    expect(exitPointerLock).not.toHaveBeenCalled();
  });

  it('does not call exit when nothing is locked', () => {
    render(<Harness active />);
    expect(exitPointerLock).not.toHaveBeenCalled();
  });

  // requestPointerLock is asynchronous: the very press that opened the panel
  // can still be granted a moment later. Releasing once on open would miss it.
  it('releases a lock granted after it became active', () => {
    render(<Harness active />);
    expect(exitPointerLock).not.toHaveBeenCalled();

    act(() => {
      setLockedElement(document.createElement('canvas'));
      document.dispatchEvent(new Event('pointerlockchange'));
    });
    expect(exitPointerLock).toHaveBeenCalledTimes(1);
  });

  it('keeps releasing for as long as it stays active', () => {
    render(<Harness active />);
    for (let i = 0; i < 3; i++) {
      act(() => {
        setLockedElement(document.createElement('canvas'));
        document.dispatchEvent(new Event('pointerlockchange'));
      });
    }
    expect(exitPointerLock).toHaveBeenCalledTimes(3);
  });

  it('stops listening once it goes inactive, so the pointer can lock again', () => {
    const { rerender } = render(<Harness active />);
    rerender(<Harness active={false} />);

    act(() => {
      setLockedElement(document.createElement('canvas'));
      document.dispatchEvent(new Event('pointerlockchange'));
    });
    expect(exitPointerLock).not.toHaveBeenCalled();
  });

  it('stops listening on unmount', () => {
    const { unmount } = render(<Harness active />);
    unmount();

    act(() => {
      setLockedElement(document.createElement('canvas'));
      document.dispatchEvent(new Event('pointerlockchange'));
    });
    expect(exitPointerLock).not.toHaveBeenCalled();
  });

  // Embedded and permission-restricted contexts throw here. Being unable to
  // release the pointer is not a reason to take the whole page down.
  it('survives a browser that refuses to release the pointer', () => {
    setLockedElement(document.createElement('canvas'));
    Object.defineProperty(document, 'exitPointerLock', {
      value: () => {
        throw new Error('not allowed');
      },
      configurable: true,
    });
    expect(() => render(<Harness active />)).not.toThrow();
  });
});

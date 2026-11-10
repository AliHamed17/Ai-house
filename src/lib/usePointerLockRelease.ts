'use client';

import { useEffect } from 'react';

/**
 * Keeps the pointer unlocked for as long as `active` is true.
 *
 * First-person mode locks the pointer on any mouse press on the canvas (see
 * FirstPersonControls), which is right for looking around and wrong the
 * moment a click opens something to interact with: an in-scene popover is
 * real DOM, and under Pointer Lock the cursor is hidden and every mouse event
 * stays aimed at the canvas, so its link and buttons cannot be reached at all
 * until the visitor guesses at Esc.
 *
 * Releasing on open is not enough on its own. requestPointerLock is
 * asynchronous, so the press that opened the popover can still be granted
 * afterwards; listening for the whole time the popover is open catches that,
 * and catches a later press landing on the canvas behind it too.
 *
 * Looking around still works while something is open — FirstPersonControls
 * falls back to drag-to-look whenever the pointer is not locked.
 */
export function usePointerLockRelease(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    const release = () => {
      // exitPointerLock is a no-op when nothing is locked, but it throws in
      // some embedded/permission-restricted contexts, where being unable to
      // release is not a reason to take the page down.
      try {
        if (document.pointerLockElement) document.exitPointerLock();
      } catch {
        // Best-effort: drag-to-look and the popover both still work.
      }
    };
    release();
    document.addEventListener('pointerlockchange', release);
    return () => document.removeEventListener('pointerlockchange', release);
  }, [active]);
}

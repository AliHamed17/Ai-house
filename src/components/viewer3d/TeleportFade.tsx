'use client';

import { useEffect, useRef, useState } from 'react';
import { useViewerStore } from '@/lib/store/viewerStore';

/** Brief fade-to-black on teleport, skipped entirely when reduced motion is requested. */
export function TeleportFade() {
  const teleportToken = useViewerStore((s) => s.teleportToken);
  const reducedMotion = useViewerStore((s) => s.reducedMotion);
  const [visible, setVisible] = useState(false);
  // The token already reacted to, seeded with whatever the store holds at
  // mount. The store outlives this component (closing the explorer unmounts
  // it but leaves teleportToken at its last value), so keying off "token !== 0"
  // replayed the previous session's fade on every reopen after any teleport.
  const seenTokenRef = useRef(teleportToken);

  useEffect(() => {
    if (reducedMotion) {
      // Reduced motion can be switched on MID-FADE, and the cleanup below has
      // by then already cancelled the hide timer. Returning without clearing
      // `visible` would leave the explorer under a fully opaque overlay with
      // nothing left to lift it (regression). Also mark the current token
      // seen, so turning the preference back off does not fire a fade for a
      // teleport that happened while it was on.
      seenTokenRef.current = teleportToken;
      // Same exemption as below: this responds to an external preference
      // change, and it is the only thing that can lift an already-showing
      // overlay once the hide timer has been cancelled.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setVisible(false);
      return;
    }
    if (teleportToken === seenTokenRef.current) return;
    seenTokenRef.current = teleportToken;
    // Reacting to an external event signal (a teleport request), not to a
    // value derivable from props/state during render. (The rule reports only
    // the first such call per effect, which the branch above already carries
    // the exemption for.)
    setVisible(true);
    const timer = setTimeout(() => setVisible(false), 200);
    return () => clearTimeout(timer);
  }, [teleportToken, reducedMotion]);

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 z-30 bg-charcoal transition-opacity duration-200 ease-in-out"
      style={{ opacity: visible ? 1 : 0 }}
    />
  );
}

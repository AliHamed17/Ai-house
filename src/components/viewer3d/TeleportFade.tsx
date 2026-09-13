'use client';

import { useEffect, useState } from 'react';
import { useViewerStore } from '@/lib/store/viewerStore';

/** Brief fade-to-black on teleport, skipped entirely when reduced motion is requested. */
export function TeleportFade() {
  const teleportToken = useViewerStore((s) => s.teleportToken);
  const reducedMotion = useViewerStore((s) => s.reducedMotion);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (teleportToken === 0 || reducedMotion) return;
    // Reacting to an external event signal (a teleport request), not to a
    // value derivable from props/state during render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
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

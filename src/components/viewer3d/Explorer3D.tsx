'use client';

import { Component, Suspense, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Canvas } from '@react-three/fiber';
import { PCFShadowMap } from 'three';
import { Scene } from './Scene';
import { ViewerHud } from './ViewerHud';
import { Minimap } from './Minimap';
import { RoomNavigator } from './RoomNavigator';
import { MobileControls } from './MobileControls';
import { TeleportFade } from './TeleportFade';
import { Fallback2D } from './Fallback2D';
import { InteractiveFloorPlan } from '@/components/floorplan/InteractiveFloorPlan';
import { useViewerStore } from '@/lib/store/viewerStore';
import type { RoomId } from '@/lib/types';

function detectWebgl(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return Boolean(canvas.getContext('webgl2') || canvas.getContext('webgl'));
  } catch {
    return false;
  }
}

class CanvasErrorBoundary extends Component<{ children: ReactNode; onError: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onError();
  }
  render() {
    if (this.state.failed) return null;
    return this.props.children;
  }
}

export function Explorer3D({ onClose }: { onClose: () => void }) {
  const [webglOk, setWebglOk] = useState<boolean | null>(null);
  const mode = useViewerStore((s) => s.mode);
  const setMode = useViewerStore((s) => s.setMode);
  const setReducedMotion = useViewerStore((s) => s.setReducedMotion);
  const requestTeleport = useViewerStore((s) => s.requestTeleport);
  const setRenderMode = useViewerStore((s) => s.setRenderMode);

  useEffect(() => {
    // One-time capability probe against the browser's WebGL implementation —
    // an external system, not state derivable from props/render.
    const ok = detectWebgl();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setWebglOk(ok);
    setRenderMode(ok ? 'webgl' : 'fallback2d');
  }, [setRenderMode]);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [setReducedMotion]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  const handleActivateFromFloorplan = useMemo(
    () => (roomId: RoomId) => {
      requestTeleport(roomId);
      setMode('first-person');
    },
    [requestTeleport, setMode],
  );

  if (webglOk === false) {
    return <Fallback2D onExit={onClose} />;
  }

  return (
    <div className="fixed inset-0 z-50 bg-charcoal" role="dialog" aria-modal aria-label="Interactive 3D house explorer">
      {webglOk && (
        <CanvasErrorBoundary onError={() => setWebglOk(false)}>
          <Canvas
            shadows={{ type: PCFShadowMap }}
            dpr={[1, 1.6]}
            gl={{ antialias: true, powerPreference: 'high-performance' }}
            // First-person look depends on a continuous pointer-move stream
            // (see FirstPersonControls); without this, a touch browser can
            // claim a one-finger drag for native scroll/zoom and cut that
            // stream with a pointercancel, silently breaking mobile look.
            style={{ touchAction: 'none' }}
          >
            <Suspense fallback={null}>
              <Scene />
            </Suspense>
          </Canvas>
        </CanvasErrorBoundary>
      )}

      {mode === 'floorplan' && (
        <div className="absolute inset-0 z-10 overflow-y-auto bg-ivory p-6 pt-24">
          <div className="mx-auto max-w-4xl">
            <h2 className="font-display text-xl text-charcoal">Floor Plan View</h2>
            <p className="mt-1 text-sm text-charcoal/70">Select a room to walk in from that spot.</p>
            <div className="mt-4">
              <InteractiveFloorPlan onRoomActivate={handleActivateFromFloorplan} activateLabel="Walk in here" />
            </div>
          </div>
        </div>
      )}

      <ViewerHud onExit={onClose} />
      <Minimap />
      <RoomNavigator />
      <MobileControls />
      <TeleportFade />
    </div>
  );
}

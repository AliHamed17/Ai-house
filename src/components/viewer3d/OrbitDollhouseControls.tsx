'use client';

import { useRef } from 'react';
import { OrbitControls } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { useViewerStore } from '@/lib/store/viewerStore';
import { houseBounds } from '@/lib/geometry/houseBounds';

/** Orbit / "dollhouse" camera: rotate, pan, and zoom around the whole house. */
export function OrbitDollhouseControls() {
  const controlsRef = useRef<OrbitControlsImpl | null>(null);
  const reducedMotion = useViewerStore((s) => s.reducedMotion);

  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      target={[houseBounds.center.x, 1.2, houseBounds.center.z]}
      minDistance={3}
      maxDistance={Math.max(28, houseBounds.width * 1.8)}
      minPolarAngle={0.05}
      maxPolarAngle={1.45}
      enableDamping={!reducedMotion}
      dampingFactor={0.12}
      panSpeed={0.8}
      rotateSpeed={0.6}
      zoomSpeed={0.8}
      screenSpacePanning
    />
  );
}

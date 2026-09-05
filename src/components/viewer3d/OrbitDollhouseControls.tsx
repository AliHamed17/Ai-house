'use client';

import { useRef } from 'react';
import { OrbitControls } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { useViewerStore } from '@/lib/store/viewerStore';

const HOUSE_CENTER = { x: 7.9, z: 2.2 };

/** Orbit / "dollhouse" camera: rotate, pan, and zoom around the whole house. */
export function OrbitDollhouseControls() {
  const controlsRef = useRef<OrbitControlsImpl | null>(null);
  const reducedMotion = useViewerStore((s) => s.reducedMotion);

  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      target={[HOUSE_CENTER.x, 1.2, HOUSE_CENTER.z]}
      minDistance={3}
      maxDistance={28}
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

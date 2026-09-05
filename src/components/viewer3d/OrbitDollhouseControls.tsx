'use client';

import { useEffect, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { useViewerStore } from '@/lib/store/viewerStore';

const HOUSE_CENTER = { x: 7.9, z: 2.2 };
const OVERVIEW_TARGET: [number, number, number] = [HOUSE_CENTER.x, 1.2, HOUSE_CENTER.z];

/** Orbit / "dollhouse" camera: rotate, pan, and zoom around the whole house. */
export function OrbitDollhouseControls() {
  const controlsRef = useRef<OrbitControlsImpl | null>(null);
  const reducedMotion = useViewerStore((s) => s.reducedMotion);
  const camera = useThree((s) => s.camera);

  // On entering dollhouse mode from Walk the camera is wherever first-person
  // left it — at eye height inside a room, where walls and ceilings hide the
  // whole-house view. Lift it to an elevated exterior 3/4 pose on mount so the
  // dollhouse overview is visible immediately, then let OrbitControls take over.
  useEffect(() => {
    camera.position.set(HOUSE_CENTER.x + 9, 15, HOUSE_CENTER.z + 17);
    camera.lookAt(OVERVIEW_TARGET[0], OVERVIEW_TARGET[1], OVERVIEW_TARGET[2]);
    camera.updateProjectionMatrix();
    controlsRef.current?.update();
  }, [camera]);

  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      target={OVERVIEW_TARGET}
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

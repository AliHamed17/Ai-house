'use client';

import { Suspense, useLayoutEffect, useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import { PerspectiveCamera } from '@react-three/drei';
import type { PerspectiveCamera as ThreePerspectiveCamera } from 'three';
import { PCFShadowMap } from 'three';
import { HouseGeometry } from './HouseGeometry';
import { FurnitureMesh } from './FurnitureMesh';
import {
  TRANSFORMATION_CAMERA,
  TRANSFORMATION_STAGES,
  TRANSFORMATION_VARIANT_ID,
} from '@/data/kitchenTransformation';
import { getStage, visibleFurnitureAtStage } from '@/lib/transformation';
import { StageLighting, stageLightingGlows } from './StageLighting';
import type { TransformationStageId } from '@/lib/types';

/**
 * The deterministic stage renderer: the exact same house geometry and
 * furniture the explorer walks through, viewed from the manifest's locked
 * camera at one transformation stage.
 *
 * This is what produces the video's frames (see scripts/render-stage-stills.mjs),
 * which is why the sequence cannot suffer the geometry drift an uncontrolled
 * AI video generation would: every stage is the same scene graph with a
 * different subset of objects visible, rendered from a camera whose position,
 * target and FOV are constants.
 */


function LockedCamera() {
  const ref = useRef<ThreePerspectiveCamera>(null);
  // useLayoutEffect so the target is applied before the first painted frame —
  // a screenshot taken of frame 0 must already be on-target.
  useLayoutEffect(() => {
    const cam = ref.current;
    if (!cam) return;
    const { lookAt } = TRANSFORMATION_CAMERA;
    cam.lookAt(lookAt.x, lookAt.y, lookAt.z);
    cam.updateProjectionMatrix();
  }, []);
  const { position, fovDeg, near, far } = TRANSFORMATION_CAMERA;
  return (
    <PerspectiveCamera
      ref={ref}
      makeDefault
      position={[position.x, position.y, position.z]}
      fov={fovDeg}
      near={near}
      far={far}
    />
  );
}

export function TransformationStageContents({ stageId }: { stageId: TransformationStageId }) {
  const stage = getStage(stageId);
  const items = visibleFurnitureAtStage(stageId);
  return (
    <>
      <LockedCamera />
      <StageLighting lighting={stage.lighting} />
      <HouseGeometry variantId={TRANSFORMATION_VARIANT_ID} />
      {items.map((item) => (
        <group
          key={item.id}
          position={[item.position.x, 0, item.position.z]}
          rotation={[0, item.rotationYRad, 0]}
        >
          <FurnitureMesh item={item} warmLight={stageLightingGlows(stage.lighting)} />
        </group>
      ))}
    </>
  );
}

export function TransformationStageScene({ stageId }: { stageId: TransformationStageId }) {
  return (
    <Canvas
      shadows={{ type: PCFShadowMap }}
      dpr={1}
      gl={{ antialias: true, preserveDrawingBuffer: true }}
      style={{ width: '100%', height: '100%' }}
    >
      <Suspense fallback={null}>
        <TransformationStageContents stageId={stageId} />
      </Suspense>
    </Canvas>
  );
}

/** Parse a stage id from an untrusted string, falling back to the first stage. */
export function parseStageId(raw: string | null | undefined): TransformationStageId {
  const match = TRANSFORMATION_STAGES.find((s) => s.id === raw);
  return match ? match.id : TRANSFORMATION_STAGES[0].id;
}

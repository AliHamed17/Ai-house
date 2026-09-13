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
} from '@/data/kitchenTransformation';
import { getStage, visibleFurnitureAtStage } from '@/lib/transformation';
import type { TransformationLighting, TransformationStageId } from '@/lib/types';

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

/** Per-lighting-state rig values. Tuned to reproduce the reference's measured
 *  luminance arc (see LIGHTING_ENVELOPE) — daylight flat and bright, dusk
 *  deep, warm-evening warmer AND higher-contrast than the opening. */
const LIGHT_RIGS: Record<
  TransformationLighting,
  {
    sky: string;
    /** Hemisphere "ground" colour. This is what lights every downward-facing
     *  surface — the ceiling soffit, cabinet undersides, the worktop nose.
     *  A dark value here is what makes an interior render read as a black
     *  void above the wall line, so it stays a warm mid-tone in daylight and
     *  only drops for the evening beats. */
    ground: string;
    ambient: number;
    /** Broad soft fill standing in for interior bounce, which a real-time
     *  renderer has no global illumination to produce on its own. */
    fill: number;
    sunIntensity: number;
    sunColor: string;
    sunPosition: [number, number, number];
    fixtureIntensity: number;
    glow: boolean;
  }
> = {
  daylight: {
    sky: '#EAF0F4',
    ground: '#CCC2B2',
    ambient: 2.15,
    fill: 1.1,
    sunIntensity: 1.05,
    sunColor: '#FFF6E8',
    // From the open terrace/dining side rather than raking across the
    // cabinet wall: a low side-on sun threw a hard staircase shadow over the
    // whole elevation, which read as a CG artefact rather than daylight.
    sunPosition: [4, 14, 9],
    fixtureIntensity: 0,
    glow: false,
  },
  'daylight-dimming': {
    sky: '#CFD6DB',
    ground: '#A79C8B',
    ambient: 1.45,
    fill: 0.62,
    sunIntensity: 0.8,
    sunColor: '#FFEFDC',
    sunPosition: [4, 14, 9],
    fixtureIntensity: 0.25,
    glow: false,
  },
  dusk: {
    sky: '#7B8088',
    ground: '#5E564B',
    ambient: 1.02,
    fill: 0.42,
    sunIntensity: 0.22,
    sunColor: '#C9C3D2',
    sunPosition: [4, 14, 9],
    fixtureIntensity: 0.6,
    glow: true,
  },
  'warm-evening': {
    sky: '#3A342E',
    ground: '#6A5440',
    ambient: 1.0,
    fill: 0.4,
    sunIntensity: 0.1,
    sunColor: '#9FA6B8',
    sunPosition: [4, 14, 9],
    fixtureIntensity: 4.0,
    glow: true,
  },
};

/** Warm fixtures that belong to THIS kitchen's design: the two island
 *  pendants, the under-cabinet task strip and the display-cabinet interiors.
 *  Positions are derived from the authored furniture, not invented. */
const KITCHEN_FIXTURES: { position: [number, number, number]; intensity: number; distance: number }[] = [
  { position: [2.07, 1.9, 5.25], intensity: 1.0, distance: 4.5 }, // island pendant N
  { position: [2.07, 1.9, 6.45], intensity: 1.0, distance: 4.5 }, // island pendant S
  { position: [0.5, 1.42, 5.2], intensity: 0.55, distance: 2.6 }, // under-cabinet task strip
  { position: [0.5, 1.55, 6.15], intensity: 0.4, distance: 2.2 }, // suspended-shelf accent
  { position: [0.25, 1.7, 4.4], intensity: 0.5, distance: 2.4 }, // display cabinet N
  { position: [0.25, 1.7, 6.9], intensity: 0.5, distance: 2.4 }, // display cabinet S
];

function StageLighting({ lighting }: { lighting: TransformationLighting }) {
  const rig = LIGHT_RIGS[lighting];
  return (
    <>
      <color attach="background" args={[rig.sky]} />
      <hemisphereLight args={[rig.sky, rig.ground, rig.ambient]} />
      <directionalLight
        position={rig.sunPosition}
        color={rig.sunColor}
        intensity={rig.sunIntensity}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0005}
        shadow-camera-left={-8}
        shadow-camera-right={8}
        shadow-camera-top={8}
        shadow-camera-bottom={-8}
      />
      {/* Shadowless fill from the camera side, standing in for the interior
          bounce a real-time renderer cannot compute. Without it the cabinet
          wall falls into near-black wherever the sun does not reach. */}
      <directionalLight position={[6, 3, 5.65]} color={rig.sunColor} intensity={rig.fill} />
      {rig.fixtureIntensity > 0 &&
        KITCHEN_FIXTURES.map((f, i) => (
          <pointLight
            key={i}
            position={f.position}
            color="#FFC08A"
            intensity={f.intensity * rig.fixtureIntensity}
            distance={f.distance}
            decay={2}
          />
        ))}
    </>
  );
}

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
  const rig = LIGHT_RIGS[stage.lighting];
  const items = visibleFurnitureAtStage(stageId);
  return (
    <>
      <LockedCamera />
      <StageLighting lighting={stage.lighting} />
      <HouseGeometry variantId="warm-oak" />
      {items.map((item) => (
        <group
          key={item.id}
          position={[item.position.x, 0, item.position.z]}
          rotation={[0, item.rotationYRad, 0]}
        >
          <FurnitureMesh item={item} warmLight={rig.glow} />
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

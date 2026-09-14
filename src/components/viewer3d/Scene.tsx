'use client';

import { HouseGeometry } from './HouseGeometry';
import { Lighting } from './Lighting';
import { StageLighting } from './StageLighting';
import { FirstPersonControls } from './FirstPersonControls';
import { OrbitDollhouseControls } from './OrbitDollhouseControls';
import { DoorHotspots, RoomLabelHotspots } from './RoomHotspots';
import { FurnitureHotspots } from './FurnitureHotspots';
import { useViewerStore } from '@/lib/store/viewerStore';
import { getStage } from '@/lib/transformation';
import { lightingPresets } from '@/data/materials';

export function Scene() {
  const mode = useViewerStore((s) => s.mode);
  const lightingMode = useViewerStore((s) => s.lightingMode);
  const materialVariantId = useViewerStore((s) => s.materialVariantId);
  const transformationStage = useViewerStore((s) => s.transformationStage);

  // Stepping into a moment of the film must preserve the WHOLE moment. The
  // furniture already came across; without this the room's light did not,
  // because the four authored states were collapsed into the viewer's generic
  // day/evening presets, whose intensities, sky colours, sun position and
  // fixture layout are all different. Driving the explorer from the same rig
  // the frames were rendered with is what makes the handoff continuous.
  //
  // Fog still comes from the viewer's own preset: the film's camera is locked
  // inside one room, but the explorer can see across the house, and unfogged
  // distance there reads as flat. It is a property of the view, not of the
  // authored lighting.
  const stageLighting = transformationStage ? getStage(transformationStage).lighting : null;
  const fogPreset = lightingPresets[lightingMode];

  return (
    <>
      {stageLighting ? (
        <StageLighting
          lighting={stageLighting}
          fog={{
            colorHex: fogPreset.fogColorHex,
            nearM: fogPreset.fogNearM,
            farM: fogPreset.fogFarM,
          }}
        />
      ) : (
        <Lighting mode={lightingMode} />
      )}
      {/* Ceilings are hidden in Dollhouse mode: the elevated overview camera
          looks straight down, so an opaque ceiling plane would block the view
          into the room below it instead of showing the house's interior. */}
      <HouseGeometry variantId={materialVariantId} hideCeilings={mode === 'orbit'} />
      <DoorHotspots />
      <RoomLabelHotspots />
      <FurnitureHotspots />
      <FirstPersonControls />
      {mode === 'orbit' && <OrbitDollhouseControls />}
    </>
  );
}

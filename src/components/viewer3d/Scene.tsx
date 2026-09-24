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
import { TRANSFORMATION_VARIANT_ID } from '@/data/kitchenTransformation';
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
      {/* The film's frames are rendered with the transformation's own
          variant (TransformationStageScene), so a visitor who had previously
          picked cool-stone or sand-linen would otherwise step into "this exact
          moment" and find different walls and floors — the one thing the
          handoff promises is that it is the same room. Locked for the same
          reason the lighting is, and the Materials menu is disabled alongside
          the day/evening toggle while a stage is showing. */}
      <HouseGeometry
        variantId={stageLighting ? TRANSFORMATION_VARIANT_ID : materialVariantId}
        hideCeilings={mode === 'orbit'}
      />
      <DoorHotspots />
      <RoomLabelHotspots />
      <FurnitureHotspots />
      <FirstPersonControls />
      {mode === 'orbit' && <OrbitDollhouseControls />}
    </>
  );
}

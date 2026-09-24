'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useState } from 'react';
import { SiteHeader } from '@/components/layout/SiteHeader';
import { Hero } from '@/components/landing/Hero';
import { EvidenceSection } from '@/components/landing/EvidenceSection';
import { FloorPlanSection } from '@/components/landing/FloorPlanSection';
import { RoomStories } from '@/components/landing/RoomStories';
import { MaterialsBoard } from '@/components/landing/MaterialsBoard';
import { BeforeConceptSection } from '@/components/landing/BeforeConceptSection';
import { RoomTransformation } from '@/components/landing/RoomTransformation';
import { AIStudioSection } from '@/components/landing/AIStudioSection';
import { TechnicalNote } from '@/components/landing/TechnicalNote';
import { useViewerStore } from '@/lib/store/viewerStore';
import { houseModel, ENTRY_ROOM_ID } from '@/data/house';
import { parseViewerLink } from '@/lib/viewerLink';
import type { RoomId, TransformationStageId } from '@/lib/types';

const Explorer3D = dynamic(() => import('@/components/viewer3d/Explorer3D').then((m) => m.Explorer3D), {
  ssr: false,
  loading: () => (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-charcoal text-ivory">
      <p className="text-sm tracking-wide">Loading the 3D explorer…</p>
    </div>
  ),
});

export default function Home() {
  const [explorerOpen, setExplorerOpen] = useState(false);

  const openExplorerAt = useCallback(
    (roomId: RoomId, options?: { transformationStage?: TransformationStageId }) => {
      const room = houseModel.rooms.find((r) => r.id === roomId);
      if (room) {
        useViewerStore.getState().setPlayerPose({ x: room.cameraSpawn.x, z: room.cameraSpawn.z, yaw: room.cameraSpawnYaw });
        useViewerStore.getState().setActiveRoomId(room.id);
        useViewerStore.getState().setMode('first-person');
      }
      // The store outlives the explorer's unmount, so a stage left behind by
      // an earlier "Enter this moment in 3D" would otherwise be inherited by
      // the next ordinary entry: the kitchen would reopen partially built,
      // mid-build banner and all, from a click that never asked for it.
      // Every entry point states its intent here rather than relying on
      // whoever opened the explorer last to have cleaned up.
      useViewerStore.getState().setTransformationStage(options?.transformationStage ?? null);
      setExplorerOpen(true);
    },
    [],
  );

  const openExplorer = useCallback(() => openExplorerAt(ENTRY_ROOM_ID), [openExplorerAt]);

  // A shared link (see src/lib/viewerLink.ts) opens the explorer straight
  // into the view it names. This sets more than openExplorerAt does — mode,
  // lighting and materials as well as the room — because those are the whole
  // point of the link: the sender chose them, and inheriting this visitor's
  // own leftovers instead would show them a different house than the one they
  // were sent. An ordinary in-page entry deliberately keeps them, which is
  // why the two paths don't share one setter.
  //
  // Runs once, on mount: the query string is where the page was opened, not a
  // value that changes underneath a mounted page, and re-applying it later
  // would yank a visitor who had since walked somewhere else back to it.
  useEffect(() => {
    const view = parseViewerLink(window.location.search);
    if (!view) return;
    const room = houseModel.rooms.find((r) => r.id === view.roomId);
    if (!room) return;
    const store = useViewerStore.getState();
    store.setPlayerPose({ x: room.cameraSpawn.x, z: room.cameraSpawn.z, yaw: room.cameraSpawnYaw });
    store.setActiveRoomId(room.id);
    store.setMode(view.mode);
    store.setLightingMode(view.lightingMode);
    store.setMaterialVariantId(view.materialVariantId);
    store.setTransformationStage(view.transformationStage);
    // Reading window.location is a probe of an external system, not state
    // derivable during render — the same reason Explorer3D's WebGL probe
    // needs this. The explorer is code-split behind a dynamic import, so it
    // is only fetched once this decides a link actually asked for it.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setExplorerOpen(true);
  }, []);

  return (
    <>
      <SiteHeader onEnter3D={openExplorer} />
      <main className="flex-1">
        <Hero onEnter3D={openExplorer} />
        <EvidenceSection />
        <FloorPlanSection onEnterRoom={openExplorerAt} />
        <RoomStories onEnterRoom={openExplorerAt} />
        <MaterialsBoard />
        <RoomTransformation onEnterRoom={openExplorerAt} />
        <BeforeConceptSection />
        <AIStudioSection />
        <TechnicalNote />
      </main>
      <footer className="border-t border-limestone/50 px-6 py-8 text-center text-xs text-charcoal/50">
        Concept visualization only — not construction documentation. Built with Next.js, React Three Fiber, Nano
        Banana, and Higgsfield.
      </footer>
      {explorerOpen && <Explorer3D onClose={() => setExplorerOpen(false)} />}
    </>
  );
}

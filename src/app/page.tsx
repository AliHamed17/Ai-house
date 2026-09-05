'use client';

import dynamic from 'next/dynamic';
import { useCallback, useState } from 'react';
import { SiteHeader } from '@/components/layout/SiteHeader';
import { Hero } from '@/components/landing/Hero';
import { EvidenceSection } from '@/components/landing/EvidenceSection';
import { FloorPlanSection } from '@/components/landing/FloorPlanSection';
import { RoomStories } from '@/components/landing/RoomStories';
import { MaterialsBoard } from '@/components/landing/MaterialsBoard';
import { BeforeConceptSection } from '@/components/landing/BeforeConceptSection';
import { AIStudioSection } from '@/components/landing/AIStudioSection';
import { TechnicalNote } from '@/components/landing/TechnicalNote';
import { useViewerStore } from '@/lib/store/viewerStore';
import { houseModel, ENTRY_ROOM_ID } from '@/data/house';
import type { RoomId } from '@/lib/types';

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

  const openExplorerAt = useCallback((roomId: RoomId) => {
    const room = houseModel.rooms.find((r) => r.id === roomId);
    if (room) {
      useViewerStore.getState().setPlayerPose({ x: room.cameraSpawn.x, z: room.cameraSpawn.z, yaw: room.cameraSpawnYaw });
      useViewerStore.getState().setActiveRoomId(room.id);
      useViewerStore.getState().setMode('first-person');
    }
    setExplorerOpen(true);
  }, []);

  const openExplorer = useCallback(() => openExplorerAt(ENTRY_ROOM_ID), [openExplorerAt]);

  return (
    <>
      <SiteHeader onEnter3D={openExplorer} />
      <main className="flex-1">
        <Hero onEnter3D={openExplorer} />
        <EvidenceSection />
        <FloorPlanSection onEnterRoom={openExplorerAt} />
        <RoomStories onEnterRoom={openExplorerAt} />
        <MaterialsBoard />
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

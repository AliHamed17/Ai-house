'use client';

import Image from 'next/image';
import { houseModel } from '@/data/house';
import { roomEvidenceFrame } from '@/data/evidenceFrames';
import { InteractiveFloorPlan } from '@/components/floorplan/InteractiveFloorPlan';

/**
 * Shown when WebGL is unavailable, fails to initialize, or the device
 * reports inadequate performance. Keeps the experience fully usable: an
 * interactive floor plan plus a room-card gallery built from the same
 * evidence frames used elsewhere, no 3D dependency required.
 */
export function Fallback2D({ onExit }: { onExit: () => void }) {
  return (
    // Fixed to the viewport: this renders outside the explorer's modal
    // container, and the body scroll is locked, so an absolute element would
    // sit at the document origin (off-screen when the explorer was opened
    // from lower down the page), hiding the Exit button from no-WebGL users.
    <div className="fixed inset-0 z-50 overflow-y-auto bg-ivory p-6" role="dialog" aria-modal aria-label="House explorer — 2D fallback">
      <div className="mx-auto max-w-5xl">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-2xl text-charcoal">House Explorer — 2D Mode</h2>
          <button
            type="button"
            onClick={onExit}
            className="rounded-full border border-limestone/60 bg-ivory px-4 py-2 text-xs font-semibold tracking-wide text-charcoal shadow hover:bg-limestone/30"
          >
            ✕ Exit
          </button>
        </div>
        <p className="mt-2 max-w-2xl text-sm text-charcoal/70">
          Your device or browser could not start the real-time 3D view, so here is a fully usable 2D fallback: an
          interactive floor plan and a room-by-room gallery built from the same evidence and dimensions.
        </p>

        <div className="mt-6">
          <InteractiveFloorPlan activateLabel="Highlighted above" />
        </div>

        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {houseModel.rooms.map((room) => {
            const frame = roomEvidenceFrame[room.id];
            return (
              <div key={room.id} className="overflow-hidden rounded-2xl border border-limestone/60 bg-ivory shadow-sm">
                <div className="relative h-40 w-full bg-limestone/40">
                  <Image src={frame.path} alt={`Unfinished ${room.nameEn}`} fill sizes="(max-width: 640px) 100vw, 33vw" className="object-cover" />
                </div>
                <div className="p-4">
                  <h3 className="font-display text-base text-charcoal">{room.hotspotLabel}</h3>
                  <p className="mt-1 text-xs text-charcoal/70">{room.function}</p>
                  <p className="mt-2 text-[11px] uppercase tracking-wide text-charcoal/50">
                    {room.dimensions.widthM.toFixed(2)} × {room.dimensions.depthM.toFixed(2)} m · {room.confidence}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

'use client';

import { InteractiveFloorPlan } from '@/components/floorplan/InteractiveFloorPlan';
import type { RoomId } from '@/lib/types';

export function FloorPlanSection({ onEnterRoom }: { onEnterRoom: (roomId: RoomId) => void }) {
  return (
    <section id="floor-plan" className="bg-limestone/15 py-20">
      <div className="mx-auto max-w-6xl px-6">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-olive">Interactive floor plan</p>
        <h2 className="font-display mt-3 text-3xl text-charcoal">Hover a room, see its dimensions, jump right in</h2>
        <p className="mt-4 max-w-2xl text-charcoal/70">
          Every room below is drawn from the same data that builds the 3D model — dimensions, confidence, and
          adjacency all come from one source of truth. The tan-highlighted room is the protected MAMAD; wet rooms are
          shown in stone grey.
        </p>
        <div className="mt-8">
          <InteractiveFloorPlan onRoomActivate={onEnterRoom} activateLabel="Enter this room in 3D" />
        </div>
      </div>
    </section>
  );
}

'use client';

import { ComparisonSlider } from './ComparisonSlider';
import { roomEvidenceFrame } from '@/data/evidenceFrames';
import { houseModel } from '@/data/house';
import type { RoomId } from '@/lib/types';

const FEATURED_ROOMS: RoomId[] = ['living', 'kitchen', 'parents_bed', 'bathroom_main'];

export function BeforeConceptSection() {
  return (
    <section id="comparisons" className="mx-auto max-w-6xl px-6 py-20">
      <p className="text-xs font-semibold uppercase tracking-[0.3em] text-olive">Before / concept</p>
      <h2 className="font-display mt-3 text-3xl text-charcoal">Drag to compare, room by room</h2>
      <p className="mt-4 max-w-2xl text-charcoal/70">
        The concept images shown here are deterministic placeholders (this build has no live image-generation
        credentials configured) — see the AI Design Studio below to generate real Nano Banana concepts once
        <code className="mx-1 rounded bg-limestone/40 px-1 text-sm">GEMINI_API_KEY</code>
        is set.
      </p>
      <div className="mt-10 grid grid-cols-1 gap-6 md:grid-cols-2">
        {FEATURED_ROOMS.map((roomId) => {
          const room = houseModel.rooms.find((r) => r.id === roomId)!;
          const frame = roomEvidenceFrame[roomId];
          return (
            <ComparisonSlider
              key={roomId}
              label={room.hotspotLabel}
              beforeSrc={frame.path}
              beforeAlt={`Unfinished ${room.hotspotLabel}`}
              afterSrc={`/generated/concepts/${roomId}.svg`}
              afterAlt={`Concept placeholder for ${room.hotspotLabel}`}
            />
          );
        })}
      </div>
    </section>
  );
}

'use client';

import { ComparisonSlider } from './ComparisonSlider';
import { roomEvidenceFrame } from '@/data/evidenceFrames';
import { houseModel } from '@/data/house';
import { conceptAssetPath, hasRealConcept } from '@/data/generatedConcepts';
import type { RoomId } from '@/lib/types';

const FEATURED_ROOMS: RoomId[] = ['living', 'kitchen', 'parents_bed', 'bathroom_main'];

export function BeforeConceptSection() {
  const anyReal = FEATURED_ROOMS.some(hasRealConcept);
  return (
    <section id="comparisons" className="mx-auto max-w-6xl px-6 py-20">
      <p className="text-xs font-semibold uppercase tracking-[0.3em] text-olive">Before / concept</p>
      <h2 className="font-display mt-3 text-3xl text-charcoal">Drag to compare, room by room</h2>
      <p className="mt-4 max-w-2xl text-charcoal/70">
        {anyReal ? (
          <>
            The concept images shown here were generated with Nano Banana (Gemini) from each room&rsquo;s unfinished
            frame; any room still awaiting a render shows a clearly-labeled placeholder. Regenerate them with
            <code className="mx-1 rounded bg-limestone/40 px-1 text-sm">uv run scripts/generate-concepts.py</code>.
          </>
        ) : (
          <>
            The concept images shown here are deterministic placeholders (this build has no live image-generation
            credentials configured). Generate real Nano Banana concepts by running
            <code className="mx-1 rounded bg-limestone/40 px-1 text-sm">uv run scripts/generate-concepts.py</code>
            with <code className="mx-1 rounded bg-limestone/40 px-1 text-sm">GEMINI_API_KEY</code> set, or use the AI
            Design Studio below.
          </>
        )}
      </p>
      <div className="mt-10 grid grid-cols-1 gap-6 md:grid-cols-2">
        {FEATURED_ROOMS.map((roomId) => {
          const room = houseModel.rooms.find((r) => r.id === roomId)!;
          const frame = roomEvidenceFrame[roomId];
          const real = hasRealConcept(roomId);
          return (
            <ComparisonSlider
              key={roomId}
              label={room.hotspotLabel}
              beforeSrc={frame.path}
              beforeAlt={`Unfinished ${room.hotspotLabel}`}
              afterSrc={conceptAssetPath(roomId)}
              afterAlt={real ? `Nano Banana concept for ${room.hotspotLabel}` : `Concept placeholder for ${room.hotspotLabel}`}
            />
          );
        })}
      </div>
    </section>
  );
}

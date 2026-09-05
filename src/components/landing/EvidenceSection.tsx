'use client';

import Image from 'next/image';
import { useState } from 'react';
import { roomEvidenceFrame } from '@/data/evidenceFrames';

const GALLERY_ROOMS: Array<keyof typeof roomEvidenceFrame> = [
  'stair_landing',
  'entry_hall',
  'living',
  'terrace_social',
  'bathroom_main',
  'hall_south',
  'mamad',
  'twin_bed',
  'bathroom_ensuite',
  'parents_bed',
];

export function EvidenceSection() {
  const [videoStarted, setVideoStarted] = useState(false);

  return (
    <section id="evidence" className="mx-auto max-w-6xl px-6 py-20">
      <p className="text-xs font-semibold uppercase tracking-[0.3em] text-olive">Evidence discipline</p>
      <h2 className="font-display mt-3 text-3xl text-charcoal">What we know versus what we assumed</h2>
      <p className="mt-4 max-w-2xl text-charcoal/70">
        This concept was built from one photographed floor-plan drawing and one 61-second handheld walkthrough of the
        unfinished house — not a construction survey. The floor plan controls topology; the video controls daylight,
        openings, and spatial character. Where they conflict, the plan wins and the conflict is recorded as an
        assumption (see <code className="rounded bg-limestone/40 px-1 text-sm">ASSUMPTIONS.md</code>).
      </p>

      <div className="mt-10 grid grid-cols-1 gap-8 lg:grid-cols-2">
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wide text-charcoal/60">Original floor plan</h3>
          <div className="relative mt-3 aspect-[4/3] w-full overflow-hidden rounded-2xl border border-limestone/60 bg-limestone/20">
            <Image src="/evidence/floorplan.jpg" alt="Original architect's floor-plan photograph" fill sizes="(max-width: 1024px) 100vw, 50vw" className="object-cover" />
          </div>
          <p className="mt-2 text-xs text-charcoal/50">
            Perspective-distorted photograph. Printed dimensions (cm) were used where legible; everything else is
            flagged approximate.
          </p>
        </div>

        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wide text-charcoal/60">Site walkthrough (61s, portrait)</h3>
          <div className="relative mt-3 aspect-[9/16] max-h-[420px] w-full overflow-hidden rounded-2xl border border-limestone/60 bg-charcoal mx-auto lg:mx-0">
            {!videoStarted ? (
              <button
                type="button"
                onClick={() => setVideoStarted(true)}
                className="group absolute inset-0 flex items-center justify-center"
                aria-label="Play the site walkthrough video"
              >
                <Image src="/evidence/frames/00-00-14_open-social-zone.jpg" alt="Walkthrough poster frame" fill sizes="360px" className="object-cover opacity-70" />
                <span className="relative z-10 flex h-16 w-16 items-center justify-center rounded-full bg-ivory/90 text-charcoal shadow-lg transition-transform group-hover:scale-105">
                  ▶
                </span>
              </button>
            ) : (
              <video src="/evidence/walkthrough.mp4" controls autoPlay playsInline className="h-full w-full object-cover" />
            )}
          </div>
          <p className="mt-2 text-xs text-charcoal/50">Unfinished construction condition: bare walls, no flooring, exposed electrical points.</p>
        </div>
      </div>

      <h3 className="mt-14 text-sm font-semibold uppercase tracking-wide text-charcoal/60">Selected walkthrough frames</h3>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {GALLERY_ROOMS.map((roomId) => {
          const frame = roomEvidenceFrame[roomId];
          return (
            <div key={roomId} className="overflow-hidden rounded-xl border border-limestone/50 bg-limestone/10">
              <div className="relative aspect-[4/5] w-full">
                <Image src={frame.path} alt={`Evidence frame for ${roomId}`} fill sizes="200px" className="object-cover" />
              </div>
              <p className="px-2 py-1.5 text-[10px] uppercase tracking-wide text-charcoal/50">{frame.timestamp}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}

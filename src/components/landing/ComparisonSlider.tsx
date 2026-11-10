'use client';

import Image from 'next/image';
import { useState } from 'react';

export interface ComparisonSliderProps {
  label: string;
  beforeSrc: string;
  beforeAlt: string;
  afterSrc: string;
  afterAlt: string;
}

export function ComparisonSlider({ label, beforeSrc, beforeAlt, afterSrc, afterAlt }: ComparisonSliderProps) {
  const [value, setValue] = useState(50);
  const afterIsSvg = afterSrc.endsWith('.svg');

  return (
    <div className="overflow-hidden rounded-3xl border border-limestone/60 bg-ivory shadow-sm">
      <div className="relative aspect-[4/3] w-full select-none">
        {/* afterSrc (Concept) is the always-visible base layer, and beforeSrc
            (Unfinished) is the clipped overlay revealed from the left — the
            REVERSE of a naive reading of "before is the base" — because the
            "Unfinished" label below is pinned to the left corner and
            "Concept" to the right (regression: the original pairing put
            Concept on the left, under the "Unfinished" label, and vice
            versa). The clip-path itself is unchanged, so the divider's own
            drag direction still feels exactly as before. */}
        <Image src={afterSrc} alt={afterAlt} fill sizes="(max-width: 1024px) 100vw, 50vw" className="object-cover" unoptimized={afterIsSvg} />
        <div className="absolute inset-0 overflow-hidden" style={{ clipPath: `inset(0 ${100 - value}% 0 0)` }}>
          <Image src={beforeSrc} alt={beforeAlt} fill sizes="(max-width: 1024px) 100vw, 50vw" className="object-cover" />
        </div>
        <div className="pointer-events-none absolute inset-y-0 w-0.5 bg-ivory shadow" style={{ left: `${value}%` }} />
        <span className="pointer-events-none absolute left-3 top-3 rounded-full bg-charcoal/70 px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-ivory">
          Unfinished
        </span>
        <span className="pointer-events-none absolute right-3 top-3 rounded-full bg-bronze/85 px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-ivory">
          Concept
        </span>
      </div>
      <div className="p-4">
        <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-wide text-charcoal/60">
          {label}
          <input
            type="range"
            min={0}
            max={100}
            value={value}
            onChange={(e) => setValue(Number(e.target.value))}
            className="accent-bronze"
            aria-label={`Reveal amount for ${label} comparison`}
          />
        </label>
      </div>
    </div>
  );
}

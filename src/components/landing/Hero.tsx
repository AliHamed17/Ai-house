'use client';

import Image from 'next/image';

export function Hero({ onEnter3D }: { onEnter3D: () => void }) {
  return (
    <section className="relative flex min-h-[92vh] items-end overflow-hidden bg-charcoal">
      <Image
        src="/evidence/frames/00-00-16_open-social-zone.jpg"
        alt="Unfinished open social zone of the house, evidence frame from the walkthrough video"
        fill
        priority
        sizes="100vw"
        className="object-cover opacity-60"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-charcoal via-charcoal/40 to-charcoal/10" />
      <div className="relative mx-auto w-full max-w-6xl px-6 pb-20 pt-32">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-limestone">Warm modern luxury · Interactive concept</p>
        <h1 className="font-display mt-4 max-w-3xl text-4xl leading-tight text-ivory sm:text-5xl md:text-6xl">
          An unfinished house, reimagined as a navigable warm-modern-luxury home.
        </h1>
        <p className="mt-5 max-w-xl text-base text-ivory/80">
          Walk every room in real time, compare the unfinished site against the design concept, and see how light,
          stone, and oak could complete this house — built from the real floor plan and walkthrough, not a rendered
          video loop.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={onEnter3D}
            className="rounded-full bg-bronze px-6 py-3 text-sm font-semibold text-ivory shadow-lg hover:opacity-90"
          >
            Enter 3D Explorer
          </button>
          <a
            href="#floor-plan"
            className="rounded-full border border-ivory/40 px-6 py-3 text-sm font-semibold text-ivory hover:bg-ivory/10"
          >
            View Floor Plan
          </a>
        </div>
      </div>
    </section>
  );
}

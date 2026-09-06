'use client';

import Image from 'next/image';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  JOURNEY_ORDER,
  JOURNEY_ROOM_COUNT,
  journeyRooms,
  sampleJourney,
} from '@/lib/journey/sequence';
import {
  interiorRendersByVariant,
  interiorVariantIds,
  interiorVariantLabels,
  type InteriorVariantId,
} from '@/data/interiors';
import type { RoomId } from '@/lib/types';

const PRELOAD_AHEAD = 2;

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const apply = () => setReduced(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);
  return reduced;
}

export function HouseJourney({ onEnterRoom }: { onEnterRoom: (roomId: RoomId) => void }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [progress, setProgress] = useState(0);
  const [variant, setVariant] = useState<InteriorVariantId>('warm-oak');
  const reducedMotion = usePrefersReducedMotion();
  const rooms = useMemo(() => journeyRooms(), []);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return undefined;
    let frame = 0;
    const read = () => {
      frame = 0;
      const rect = track.getBoundingClientRect();
      const span = rect.height - window.innerHeight;
      if (span <= 0) return;
      const p = -rect.top / span;
      setProgress(p < 0 ? 0 : p > 1 ? 1 : p);
    };
    const onScroll = () => {
      if (!frame) frame = window.requestAnimationFrame(read);
    };
    read();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, []);

  const sample = useMemo(() => sampleJourney(progress), [progress]);
  const renders = interiorRendersByVariant[variant];
  const activeRoom = rooms[sample.activeIndex];

  const jumpTo = useCallback((index: number) => {
    const track = trackRef.current;
    if (!track) return;
    const span = track.offsetHeight - window.innerHeight;
    const target = track.offsetTop + (index / (JOURNEY_ROOM_COUNT - 1)) * span;
    window.scrollTo({ top: target, behavior: reducedMotion ? 'auto' : 'smooth' });
  }, [reducedMotion]);

  const variantPicker = (
    <div className="flex flex-wrap gap-2">
      {interiorVariantIds.map((id) => (
        <button
          key={id}
          type="button"
          onClick={() => setVariant(id)}
          aria-pressed={variant === id}
          className={`rounded-full border px-4 py-2 text-xs font-semibold transition ${
            variant === id
              ? 'border-ivory bg-ivory text-charcoal'
              : 'border-ivory/40 text-ivory/80 hover:border-ivory/80 hover:text-ivory'
          }`}
        >
          {interiorVariantLabels[id]}
        </button>
      ))}
    </div>
  );

  if (reducedMotion) {
    return (
      <section id="journey" className="bg-charcoal py-20">
        <div className="mx-auto max-w-6xl px-6">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-limestone">Walk the house</p>
          <h2 className="font-display mt-3 text-3xl text-ivory">Every room, in three designs</h2>
          <div className="mt-6">{variantPicker}</div>
          <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {rooms.map((room) => (
              <button
                key={room.id}
                type="button"
                onClick={() => onEnterRoom(room.id)}
                className="group overflow-hidden rounded-2xl border border-ivory/15 text-left"
              >
                <div className="relative aspect-[3/4] w-full">
                  <Image
                    src={renders[room.id]!.path}
                    alt={`${interiorVariantLabels[variant]} concept for ${room.hotspotLabel}`}
                    fill
                    sizes="(max-width: 640px) 100vw, 33vw"
                    className="object-cover"
                  />
                </div>
                <p className="px-4 py-3 text-sm text-ivory">{room.hotspotLabel}</p>
              </button>
            ))}
          </div>
        </div>
      </section>
    );
  }

  const preloadFrom = Math.min(JOURNEY_ROOM_COUNT - 1, sample.activeIndex + 1);
  const preloadTo = Math.min(JOURNEY_ROOM_COUNT - 1, sample.activeIndex + PRELOAD_AHEAD);

  return (
    <section id="journey" aria-label="Scroll through the house">
      <div ref={trackRef} style={{ height: `${JOURNEY_ROOM_COUNT * 90}svh` }} className="relative">
        <div className="sticky top-0 h-svh w-full overflow-hidden bg-charcoal">
          {sample.layers.map((layer) => {
            const render = renders[layer.roomId];
            if (!render) return null;
            return (
              <div
                key={`${variant}-${layer.roomId}`}
                className="absolute inset-0"
                style={{
                  opacity: layer.opacity,
                  transform: `scale(${layer.scale}) translate3d(0, ${layer.parallax}px, 0)`,
                  willChange: 'opacity, transform',
                }}
              >
                <Image
                  src={render.path}
                  alt={`${interiorVariantLabels[variant]} concept for ${render.title}`}
                  fill
                  priority={layer.index <= 1}
                  sizes="100vw"
                  className="object-cover"
                />
              </div>
            );
          })}

          <div aria-hidden className="pointer-events-none absolute h-px w-px overflow-hidden opacity-0">
            {Array.from({ length: preloadTo - preloadFrom + 1 }, (_, n) => {
              const room = JOURNEY_ORDER[preloadFrom + n];
              const render = room ? renders[room] : undefined;
              return render ? (
                <Image key={render.path} src={render.path} alt="" width={16} height={16} sizes="16px" />
              ) : null;
            })}
          </div>

          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-charcoal via-charcoal/25 to-charcoal/60" />

          <div className="absolute inset-x-0 top-0 px-6 pt-8">
            <div className="mx-auto flex max-w-6xl flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-limestone">Walk the house</p>
                <p className="mt-1 text-sm text-ivory/70">
                  Room {sample.activeIndex + 1} of {JOURNEY_ROOM_COUNT}
                </p>
              </div>
              <div className="pointer-events-auto">{variantPicker}</div>
            </div>
          </div>

          <div className="absolute inset-x-0 bottom-0 px-6 pb-12">
            <div className="mx-auto flex max-w-6xl flex-col gap-5">
              <div>
                <h3 className="font-display text-4xl text-ivory sm:text-5xl">{activeRoom.hotspotLabel}</h3>
                <p className="mt-2 text-sm text-ivory/70">
                  {activeRoom.dimensions.widthM.toFixed(2)} × {activeRoom.dimensions.depthM.toFixed(2)} m
                  {activeRoom.nameHe ? ` · ${activeRoom.nameHe}` : ''}
                  {activeRoom.isProtected ? ' · 🛡 protected room' : ''}
                </p>
              </div>
              <div className="pointer-events-auto flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => onEnterRoom(activeRoom.id)}
                  className="rounded-full bg-ivory px-5 py-2.5 text-xs font-semibold text-charcoal hover:bg-limestone"
                >
                  Step inside {activeRoom.hotspotLabel} →
                </button>
                <div className="flex flex-wrap gap-1.5">
                  {rooms.map((room, i) => (
                    <button
                      key={room.id}
                      type="button"
                      onClick={() => jumpTo(i)}
                      aria-label={`Jump to ${room.hotspotLabel}`}
                      aria-current={i === sample.activeIndex}
                      className={`h-1.5 rounded-full transition-all ${
                        i === sample.activeIndex ? 'w-8 bg-ivory' : 'w-3 bg-ivory/35 hover:bg-ivory/70'
                      }`}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

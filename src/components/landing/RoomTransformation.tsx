'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import {
  TRANSFORMATION_DURATION_SEC,
  TRANSFORMATION_ROOM_ID,
  TRANSFORMATION_STAGES,
} from '@/data/kitchenTransformation';
import {
  getTransformationStageAtTime,
  sequenceProgress,
  timeForProgress,
} from '@/lib/transformation';
import { useViewerStore } from '@/lib/store/viewerStore';
import type { RoomId, TransformationStageId } from '@/lib/types';

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

function subscribeToReducedMotion(onChange: () => void): () => void {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {};
  const query = window.matchMedia(REDUCED_MOTION_QUERY);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

function getReducedMotionSnapshot(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia(REDUCED_MOTION_QUERY).matches;
}

/** No media queries exist during SSR, so the server renders the motion-safe
 *  markup and the client corrects it on hydration. */
function getReducedMotionServerSnapshot(): boolean {
  return false;
}

const ASSETS = {
  mp4: '/transformation/kitchen-transformation.mp4',
  webm: '/transformation/kitchen-transformation.webm',
  poster: '/transformation/kitchen-transformation-poster.jpg',
};

/**
 * The transformation sequence as a landing-page section.
 *
 * The important part is not the player — it is that `video.currentTime` is
 * mapped through the shared manifest to a stage id, and that stage id is
 * pushed into the same viewer store the real-time 3D room reads. The film and
 * the model are two views of one design state, so "enter this exact moment in
 * 3D" is a genuine handoff rather than a coincidence of two separately
 * authored things looking similar.
 */
export function RoomTransformation({
  onEnterRoom,
}: {
  onEnterRoom: (roomId: RoomId, options?: { transformationStage?: TransformationStageId }) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const sectionRef = useRef<HTMLDivElement>(null);
  const [stageId, setStageId] = useState<TransformationStageId>(TRANSFORMATION_STAGES[0].id);
  const [progress, setProgress] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [inView, setInView] = useState(false);
  const [loadVideo, setLoadVideo] = useState(false);

  // Read the preference here rather than from the viewer store. The store's
  // reducedMotion flag is only ever set by Explorer3D's media-query listener,
  // and the explorer is not mounted until the visitor opens it — so on a
  // normal first visit this component saw the default `false` and autoplayed
  // even for a visitor who had asked for reduced motion. The CSS rule does
  // not pause video, so nothing else would have caught it.
  //
  // Subscribed rather than read into state in an effect, so the very first
  // client render already has the real value and autoplay is never started
  // and then retracted.
  const reducedMotion = useSyncExternalStore(
    subscribeToReducedMotion,
    getReducedMotionSnapshot,
    getReducedMotionServerSnapshot,
  );

  const setLightingMode = useViewerStore((s) => s.setLightingMode);

  const stage = useMemo(() => TRANSFORMATION_STAGES.find((s) => s.id === stageId)!, [stageId]);

  // Only fetch the video once the section is near the viewport: it is the
  // heaviest asset on the page and the landing view must not wait on it.
  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          setInView(entry.isIntersecting);
          if (entry.isIntersecting) setLoadVideo(true);
        }
      },
      { rootMargin: '200px 0px', threshold: 0.25 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Autoplay when scrolled into view, pause when it leaves — but never when
  // the visitor has asked for reduced motion, where the poster plus the stage
  // list carries the same information without moving.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    // Enabling the preference mid-playback has to stop the motion that is
    // already running — returning early here would have honoured the
    // preference only for playback that had not started yet.
    if (reducedMotion) {
      video.pause();
      return;
    }
    if (inView) {
      video.play().catch(() => {
        /* autoplay can be refused; the explicit Play control still works */
      });
    } else {
      video.pause();
    }
  }, [inView, reducedMotion]);

  const handleTimeUpdate = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    const t = video.currentTime;
    setProgress(sequenceProgress(t));
    const next = getTransformationStageAtTime(t);
    setStageId((current) => (current === next.id ? current : next.id));
  }, []);

  const scrub = useCallback((value: number) => {
    const video = videoRef.current;
    const t = timeForProgress(value);
    if (video) video.currentTime = t;
    setProgress(value);
    setStageId(getTransformationStageAtTime(t).id);
  }, []);

  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) void video.play();
    else video.pause();
  }, []);

  /** Step out of the film and into the same design state in the 3D explorer. */
  const enterAtThisStage = useCallback(() => {
    const video = videoRef.current;
    // Read the element's OWN clock, not the `stageId` state (regression).
    // `timeupdate` fires roughly four times a second and is not
    // frame-synchronous, so between two of its events the state still names
    // the PREVIOUS stage while the video has visibly crossed the boundary —
    // and a click in that gap opened the explorer on furniture and lighting
    // the visitor was demonstrably not looking at. currentTime is exact at the
    // instant of the click, which is precisely the instant that matters here.
    //
    // Guarded on readyState: before metadata exists currentTime is a
    // meaningless 0 (nothing has been loaded to seek within), while the state
    // is correct by construction — it starts at the first stage and scrub()
    // writes it directly from the time it just set.
    const stageNow =
      video && video.readyState >= HTMLMediaElement.HAVE_METADATA
        ? getTransformationStageAtTime(video.currentTime)
        : stage;
    // Keep the visible stage list agreeing with the state just handed off, so
    // the section behind the explorer does not go on highlighting the beat
    // that was NOT opened.
    setStageId(stageNow.id);
    // The stage's OWN authored rig lights the explorer now (see Scene.tsx),
    // so this no longer drives the handoff itself. It sets the mode the
    // visitor falls back to the moment they clear the stage with "Show
    // finished kitchen", so leaving an evening beat does not snap the room to
    // midday.
    setLightingMode(stageNow.lighting === 'warm-evening' || stageNow.lighting === 'dusk' ? 'evening' : 'day');
    // The page owns whether the explorer is mounted (see page.tsx), same as
    // the floor plan and room-story sections — the store's isExplorerOpen is
    // not what actually renders it. The stage travels WITH the request rather
    // than being written to the store first: openExplorerAt resets it on
    // every entry, so setting it here beforehand would be clobbered, and an
    // ordinary entry would otherwise inherit whatever this one left behind.
    onEnterRoom(TRANSFORMATION_ROOM_ID, { transformationStage: stageNow.id });
  }, [stage, setLightingMode, onEnterRoom]);

  return (
    <section
      ref={sectionRef}
      id="transformation"
      className="border-t border-limestone/50 bg-ivory px-6 py-20"
      aria-labelledby="transformation-heading"
    >
      <div className="mx-auto max-w-5xl">
        <p className="text-xs uppercase tracking-[0.2em] text-bronze">The kitchen, built in front of you</p>
        <h2 id="transformation-heading" className="mt-3 font-display text-3xl text-charcoal sm:text-4xl">
          From bare shell to finished kitchen
        </h2>
        <p className="mt-4 max-w-2xl text-sm leading-relaxed text-charcoal/70">
          Every frame is rendered from the same 3D model you can walk through — the camera never moves, and
          nothing that appears is ever redrawn. {TRANSFORMATION_STAGES.length} stages, {TRANSFORMATION_DURATION_SEC}s.
        </p>

        <div className="mt-10 grid gap-8 lg:grid-cols-[minmax(0,340px)_1fr] lg:items-start">
          <div className="relative overflow-hidden rounded-2xl border border-limestone/60 bg-charcoal shadow-xl">
            <video
              ref={videoRef}
              className="block h-auto w-full"
              poster={ASSETS.poster}
              muted
              playsInline
              loop
              preload={loadVideo ? 'metadata' : 'none'}
              onTimeUpdate={handleTimeUpdate}
              onPlay={() => setPlaying(true)}
              onPause={() => setPlaying(false)}
              aria-label="Kitchen transformation sequence"
            >
              {loadVideo && <source src={ASSETS.webm} type="video/webm" />}
              {loadVideo && <source src={ASSETS.mp4} type="video/mp4" />}
            </video>
          </div>

          <div>
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={togglePlay}
                className="rounded-full bg-charcoal px-4 py-2 text-xs font-medium text-ivory hover:bg-bronze"
              >
                {playing ? 'Pause' : 'Play'}
              </button>
              <button
                type="button"
                onClick={() => scrub(0)}
                className="rounded-full border border-limestone px-4 py-2 text-xs font-medium text-charcoal hover:bg-limestone/30"
              >
                Replay
              </button>
              <button
                type="button"
                onClick={enterAtThisStage}
                className="rounded-full bg-bronze px-4 py-2 text-xs font-medium text-ivory hover:bg-charcoal"
              >
                Enter this moment in 3D
              </button>
            </div>

            <label className="mt-6 block">
              <span className="text-xs uppercase tracking-[0.16em] text-charcoal/60">
                Scrub the build — {stage.label}
              </span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.001}
                value={progress}
                onChange={(e) => scrub(Number(e.target.value))}
                className="mt-2 w-full accent-bronze"
                aria-label="Scrub the transformation sequence"
              />
            </label>

            <p className="mt-3 min-h-[2.5rem] text-sm text-charcoal/80" aria-live="polite">
              {stage.caption}
            </p>

            <ol className="mt-6 grid gap-1 sm:grid-cols-2">
              {TRANSFORMATION_STAGES.map((s) => {
                const active = s.id === stageId;
                return (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => scrub(s.start / TRANSFORMATION_DURATION_SEC)}
                      aria-current={active ? 'step' : undefined}
                      className={`flex w-full items-baseline gap-2 rounded-md px-2 py-1 text-left text-xs transition-colors ${
                        active ? 'bg-bronze/15 font-semibold text-charcoal' : 'text-charcoal/60 hover:bg-limestone/30'
                      }`}
                    >
                      <span className="tabular-nums text-[10px] text-charcoal/40">{s.start.toFixed(2)}s</span>
                      <span>{s.label}</span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </div>
        </div>
      </div>
    </section>
  );
}

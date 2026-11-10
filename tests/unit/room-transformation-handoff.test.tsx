import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { RoomTransformation } from '@/components/landing/RoomTransformation';
import { TRANSFORMATION_STAGES } from '@/data/kitchenTransformation';
import { getTransformationStageAtTime } from '@/lib/transformation';

/**
 * "Enter this moment in 3D" promises the explorer opens on the design state
 * the visitor is looking at. The whole section is built on that being literally
 * true — the film and the model are two views of one manifest — so a handoff
 * that opens on a different stage's furniture and lighting breaks the one claim
 * the feature makes.
 */

// jsdom implements neither, and the component subscribes to both on mount.
// Reached through an index signature rather than the typed `window`: both are
// declared as always-present in lib.dom, so a presence check against the typed
// object narrows to `never` and will not compile.
beforeAll(() => {
  const w = window as unknown as Record<string, unknown>;
  if (!w.IntersectionObserver) {
    w.IntersectionObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
      takeRecords() {
        return [];
      }
      readonly root = null;
      readonly rootMargin = '';
      readonly thresholds: readonly number[] = [];
    };
  }
  if (!w.matchMedia) {
    w.matchMedia = (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
      dispatchEvent: () => false,
    });
  }
});

afterEach(cleanup);

/**
 * Moves playback WITHOUT firing `timeupdate` — the state the browser is
 * genuinely in between two of those events, which is where the bug lived.
 * jsdom loads no media, so readyState is stubbed to HAVE_METADATA to stand in
 * for a video whose duration is known (the condition the component gates on).
 */
function playTo(video: HTMLVideoElement, seconds: number): void {
  Object.defineProperty(video, 'readyState', { value: 1, configurable: true });
  Object.defineProperty(video, 'currentTime', { value: seconds, configurable: true, writable: true });
}

function renderSection() {
  const onEnterRoom = vi.fn();
  render(<RoomTransformation onEnterRoom={onEnterRoom} />);
  const video = document.querySelector('video') as HTMLVideoElement;
  const enter = screen.getByRole('button', { name: /Enter this moment in 3D/i });
  return { onEnterRoom, video, enter };
}

describe('RoomTransformation → 3D handoff', () => {
  it('hands off the stage the video is actually showing, not the last sampled one (regression)', () => {
    // `timeupdate` fires roughly four times a second and is not
    // frame-synchronous, so for up to a quarter second after a boundary the
    // component's own stageId still named the PREVIOUS stage. Clicking in that
    // gap opened the explorer on furniture and lighting the visitor was
    // demonstrably not looking at.
    const { onEnterRoom, video, enter } = renderSection();

    // A stage several beats in, deliberately not the first — and reached
    // without a single timeupdate, so the component's sampled state is still
    // the initial one.
    const target = TRANSFORMATION_STAGES[4];
    expect(target.start).toBeGreaterThan(0);
    act(() => playTo(video, target.start + 0.01));
    fireEvent.click(enter);

    expect(onEnterRoom).toHaveBeenCalledTimes(1);
    expect(onEnterRoom.mock.calls[0][1]).toEqual({ transformationStage: target.id });
    expect(target.id).not.toBe(TRANSFORMATION_STAGES[0].id);
  });

  it('hands off the stage on the boundary frame itself, not the one just before it', () => {
    // Stages are half-open [start, end), so the boundary instant belongs to the
    // stage it opens — the same rule the compositor schedules clips by.
    const { onEnterRoom, video, enter } = renderSection();
    const target = TRANSFORMATION_STAGES[2];
    act(() => playTo(video, target.start));
    fireEvent.click(enter);
    expect(onEnterRoom.mock.calls[0][1]).toEqual({ transformationStage: target.id });
  });

  it('keeps the visible stage list agreeing with what it just opened', () => {
    // Otherwise the section behind the explorer goes on highlighting the beat
    // that was NOT opened. The list renders every stage's label, so the claim
    // is about which one carries aria-current, not which labels exist.
    const { video, enter } = renderSection();
    const target = TRANSFORMATION_STAGES[5];
    const currentLabel = () => screen.getByRole('button', { current: 'step' }).textContent ?? '';
    expect(currentLabel()).toContain(TRANSFORMATION_STAGES[0].label);
    act(() => playTo(video, target.start + 0.05));
    fireEvent.click(enter);
    expect(currentLabel()).toContain(target.label);
  });

  it('falls back to its own tracked stage when the video has loaded nothing to read', () => {
    // Before metadata exists currentTime is a meaningless 0. Trusting it there
    // would report `empty` for a visitor who had scrubbed elsewhere — scrub()
    // sets the state directly from the time it wrote, so the state is the
    // better answer in exactly that case.
    const { onEnterRoom, video, enter } = renderSection();
    Object.defineProperty(video, 'readyState', { value: 0, configurable: true });
    Object.defineProperty(video, 'currentTime', { value: 9, configurable: true, writable: true });
    fireEvent.click(enter);
    expect(onEnterRoom.mock.calls[0][1]).toEqual({ transformationStage: TRANSFORMATION_STAGES[0].id });
    // Guards the premise: 9 s really is a different stage, so the assertion
    // above is about the readyState gate and not a coincidence.
    expect(getTransformationStageAtTime(9).id).not.toBe(TRANSFORMATION_STAGES[0].id);
  });
});

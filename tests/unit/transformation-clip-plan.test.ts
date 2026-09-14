import { describe, expect, it } from 'vitest';
import { clipWindowFrames, transformationClipPlan } from '@/lib/ai/transformationClips.server';
import { TRANSFORMATION_OUTPUT, TRANSFORMATION_STAGES } from '@/data/kitchenTransformation';

/**
 * Each clip in the plan is a real, billed Higgsfield generation, and the
 * compositor can only show it across the interval immediately BEFORE its
 * stage (it is scheduled to finish on that boundary — see
 * scripts/clip_schedule.py). So the plan must never ask for more seconds
 * than that interval can hold: every extra second is paid for and discarded.
 */
describe('transformation clip plan durations', () => {
  const stageById = Object.fromEntries(TRANSFORMATION_STAGES.map((s) => [s.id, s]));

  it('asks for exactly the span the clip can actually occupy', () => {
    const plan = transformationClipPlan();
    expect(plan.length).toBeGreaterThan(0);

    for (const entry of plan) {
      const stage = stageById[entry.stageId];
      const previous = stageById[entry.sourceStageId];
      expect(stage, `no stage ${entry.stageId}`).toBeDefined();
      expect(previous, `no source stage ${entry.sourceStageId}`).toBeDefined();

      // The window the compositor gives it: [previous.start, stage.start).
      const windowFrames = clipWindowFrames(previous.start, stage.start);
      expect(windowFrames).toBeGreaterThan(0);
      expect(entry.durationSec).toBeCloseTo(windowFrames / TRANSFORMATION_OUTPUT.fps, 10);
    }
  });

  it('never requests a clip longer than its window, at frame resolution', () => {
    // Regression: durationSec used to be the TARGET stage's own length, so
    // counter-details (2.0 s) was generated against cabinet-wall's 0.65 s
    // window and 68% of it was trimmed off unseen.
    //
    // Rounding the quoted seconds back to frames must land on the window
    // exactly — not a frame over. Several boundaries sit on a half frame
    // (0.75 s x 30 = 22.5), which is where a seconds-based duration and a
    // frame-based window drift apart.
    const fps = TRANSFORMATION_OUTPUT.fps;
    for (const entry of transformationClipPlan()) {
      const stage = stageById[entry.stageId];
      const previous = stageById[entry.sourceStageId];
      const windowFrames = clipWindowFrames(previous.start, stage.start);
      expect(Math.round(entry.durationSec * fps), `${entry.stageId} overruns its window`).toBe(
        windowFrames,
      );
    }
  });

  it('quotes a duration a generator can actually honour', () => {
    // A sub-frame or zero-length request would be meaningless to send.
    for (const entry of transformationClipPlan()) {
      expect(entry.durationSec).toBeGreaterThan(1 / TRANSFORMATION_OUTPUT.fps);
      expect(Number.isFinite(entry.durationSec)).toBe(true);
    }
  });

  it('animates from the stage immediately before the one it builds', () => {
    for (const entry of transformationClipPlan()) {
      expect(stageById[entry.sourceStageId].index).toBe(stageById[entry.stageId].index - 1);
    }
  });
});

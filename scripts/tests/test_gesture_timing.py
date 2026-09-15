"""
Unit tests for the hand gesture's timing math.

Run with: npm run test:compositor

The invariant under test is that the hand's action instant and the object's
appearance are the same moment, once. Both halves of that broke independently.
"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from gesture_timing import gesture_progress, gesture_windows, travel_for_progress  # noqa: E402

# As used by the compositor.
LEAD = 0.45
TRAIL = 0.35
FPS = 30


def action_point_closeness(travel: float) -> float:
    """gesture_path()'s own fold: 1 at the action point, 0 off-frame."""
    return 1.0 - abs(travel - 0.5) * 2.0


class TestTravelForProgress(unittest.TestCase):
    def test_endpoints_and_midpoint(self):
        self.assertAlmostEqual(travel_for_progress(0.0), 0.0)
        self.assertAlmostEqual(travel_for_progress(0.5), 0.5)
        self.assertAlmostEqual(travel_for_progress(1.0), 1.0)

    def test_is_monotonic(self):
        # Regression: the old curve climbed to 0.75 just below progress 0.5
        # and restarted at 0.25, so it ran backwards across the midpoint.
        values = [travel_for_progress(i / 400.0) for i in range(401)]
        for earlier, later in zip(values, values[1:]):
            self.assertLessEqual(earlier, later + 1e-12)

    def test_reaches_the_action_point_exactly_once(self):
        # Regression: travel crossed 0.5 at ~29% and again at ~71%, so the
        # hand approached, retreated, approached and retreated again — two
        # placements for one object.
        samples = [travel_for_progress(i / 1000.0) for i in range(1001)]
        # Strict upward crossings only: progress 0.5 is sampled exactly here,
        # and a two-sided test would count that single crossing twice.
        crossings = sum(1 for a, b in zip(samples, samples[1:]) if a < 0.5 <= b)
        self.assertEqual(crossings, 1)

    def test_the_hand_is_at_the_action_point_when_the_object_appears(self):
        # Regression: at progress 0.5 the old curve gave travel 0.25, leaving
        # the hand exactly half way to the action while the object landed.
        self.assertAlmostEqual(action_point_closeness(travel_for_progress(0.5)), 1.0)

    def test_decelerates_into_the_action_and_accelerates_away(self):
        # The documented intent: the approach slows into the placement, and
        # the withdrawal speeds up out of it.
        def step(a: float, b: float) -> float:
            return abs(travel_for_progress(b) - travel_for_progress(a))

        self.assertGreater(step(0.00, 0.05), step(0.45, 0.50))
        self.assertGreater(step(0.95, 1.00), step(0.50, 0.55))


class TestGestureProgress(unittest.TestCase):
    def test_the_action_instant_lands_exactly_on_the_stage_boundary(self):
        # Regression: a single ramp across the asymmetric window put progress
        # 0.5 at (TRAIL - LEAD) / 2 = 50 ms BEFORE the boundary — two frames
        # at 30 fps, so the hand placed the object before it existed.
        for stage_start in (0.75, 1.5, 3.1, 6.9, 11.95):
            self.assertAlmostEqual(
                gesture_progress(stage_start, stage_start, LEAD, TRAIL), 0.5
            )

    def test_spans_the_full_window_end_to_end(self):
        start = 3.1
        self.assertAlmostEqual(gesture_progress(start - LEAD, start, LEAD, TRAIL), 0.0)
        self.assertAlmostEqual(gesture_progress(start + TRAIL, start, LEAD, TRAIL), 1.0)

    def test_is_monotonic_across_the_window(self):
        start = 3.1
        times = [start - LEAD + i * (LEAD + TRAIL) / 500.0 for i in range(501)]
        values = [gesture_progress(t, start, LEAD, TRAIL) for t in times]
        for earlier, later in zip(values, values[1:]):
            self.assertLessEqual(earlier, later + 1e-12)

    def test_keeps_the_measured_lead_trail_asymmetry(self):
        # The fix must not "simplify" this into a symmetric window: the hand
        # measurably approaches for longer than it withdraws.
        start = 3.1
        quarter_in = gesture_progress(start - LEAD / 2, start, LEAD, TRAIL)
        quarter_out = gesture_progress(start + TRAIL / 2, start, LEAD, TRAIL)
        self.assertAlmostEqual(quarter_in, 0.25)
        self.assertAlmostEqual(quarter_out, 0.75)
        # Same progress delta, different real durations — that IS the asymmetry.
        self.assertNotAlmostEqual(LEAD, TRAIL)

    def test_the_frame_the_object_appears_on_is_the_frame_the_hand_acts_on(self):
        # The end-to-end claim, at the compositor's real frame resolution.
        for stage_start in (0.75, 3.75, 6.9):
            boundary_frame = int(stage_start * FPS + 0.5)
            acting = [
                f
                for f in range(boundary_frame - 20, boundary_frame + 20)
                if abs(gesture_progress(f / FPS, stage_start, LEAD, TRAIL) - 0.5) < 0.5 / FPS / LEAD
            ]
            self.assertIn(boundary_frame, acting, f"stage at {stage_start}s")



# Every gesture-bearing boundary in the real manifest, in order. `empty`
# carries an opening sweep over the bare shell at t=0, so it is in here too —
# and 0 -> 0.75 is itself under the nominal 0.8 s span, a second overlapping
# pair that a list starting at 0.75 would have quietly missed. The last three
# stages (daylight-hold, dusk, warm-reveal) are lighting-only and have none.
GESTURE_BOUNDARIES = [0.0, 0.75, 1.5, 3.1, 3.75, 5.75, 6.9, 7.7, 8.7]


class TestGestureWindows(unittest.TestCase):
    def test_adjacent_gestures_never_overlap(self):
        # Regression: the nominal window is lead + trail = 0.8 s, but
        # cabinet-wall (3.10) and counter-details (3.75) are only 0.65 s apart,
        # so the first stayed active to 3.45 while the second began at 3.30 —
        # roughly five frames with TWO large hands composited at once, against
        # a reference whose gestures are strictly sequential.
        windows = gesture_windows(GESTURE_BOUNDARIES, LEAD, TRAIL)
        for i in range(len(GESTURE_BOUNDARIES) - 1):
            ends = GESTURE_BOUNDARIES[i] + windows[i][1]
            next_begins = GESTURE_BOUNDARIES[i + 1] - windows[i + 1][0]
            self.assertLessEqual(
                ends,
                next_begins + 1e-9,
                f"gesture at {GESTURE_BOUNDARIES[i]}s still overlaps the one at {GESTURE_BOUNDARIES[i + 1]}s",
            )

    def test_the_old_nominal_windows_really_did_overlap(self):
        # Guards the premise: if these ever stopped overlapping, the test above
        # would be proving nothing.
        self.assertLess(3.75 - 3.1, LEAD + TRAIL)

    def test_a_roomy_gap_keeps_the_full_measured_window(self):
        # Shrinking must apply ONLY where it is needed — the measured lead and
        # trail are the default, not a ceiling to be negotiated everywhere.
        windows = gesture_windows([0.0, 5.0, 10.0], LEAD, TRAIL)
        for lead, trail in windows:
            self.assertAlmostEqual(lead, LEAD)
            self.assertAlmostEqual(trail, TRAIL)

    def test_a_tight_gap_is_split_in_the_measured_proportion(self):
        # 0.65 s of room, shared as 0.45 : 0.35 — the two gestures meet exactly
        # once, and neither is cut short disproportionately.
        windows = gesture_windows([3.1, 3.75], LEAD, TRAIL)
        gap = 3.75 - 3.1
        self.assertAlmostEqual(windows[0][1], gap * TRAIL / (LEAD + TRAIL))
        self.assertAlmostEqual(windows[1][0], gap * LEAD / (LEAD + TRAIL))
        self.assertAlmostEqual(windows[0][1] + windows[1][0], gap)

    def test_the_action_instant_still_lands_on_the_boundary_after_shrinking(self):
        # The whole point of shrinking rather than clipping: the gesture plays
        # its complete arc and still peaks exactly on its own boundary.
        windows = gesture_windows(GESTURE_BOUNDARIES, LEAD, TRAIL)
        for boundary, (lead, trail) in zip(GESTURE_BOUNDARIES, windows):
            self.assertAlmostEqual(gesture_progress(boundary, boundary, lead, trail), 0.5)
            self.assertAlmostEqual(gesture_progress(boundary - lead, boundary, lead, trail), 0.0)
            self.assertAlmostEqual(gesture_progress(boundary + trail, boundary, lead, trail), 1.0)

    def test_only_one_gesture_is_ever_on_screen(self):
        # The end-to-end claim, swept at the compositor's real frame rate.
        windows = gesture_windows(GESTURE_BOUNDARIES, LEAD, TRAIL)
        for frame in range(int(13.37 * FPS) + 1):
            t = frame / FPS
            active = [
                b
                for b, (lead, trail) in zip(GESTURE_BOUNDARIES, windows)
                if b - lead <= t <= b + trail and 0.0 < gesture_progress(t, b, lead, trail) < 1.0
            ]
            self.assertLessEqual(len(active), 1, f"two hands on screen at t={t:.3f}s: {active}")


if __name__ == "__main__":
    unittest.main()

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

from gesture_timing import gesture_progress, travel_for_progress  # noqa: E402

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


if __name__ == "__main__":
    unittest.main()

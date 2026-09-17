"""
Unit tests for the compositor's micro-clip frame scheduling.

Run with: npm run test:compositor  (python3 -m unittest discover)

Stdlib only, on purpose — these guard real money. Each approved clip is a paid
Higgsfield generation, so a scheduling bug that drops one is a silent loss,
not a cosmetic glitch.
"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from clip_schedule import (  # noqa: E402
    CLIP_LANDING_FRAMES,
    build_clip_landing,
    build_clip_schedule,
    build_clip_windows,
    frame_at,
)

FPS = 30

# The real manifest's first beats (src/data/kitchenTransformation.ts).
STAGES = [
    {"id": "empty", "start": 0.0, "end": 0.75},
    {"id": "upper-cabinets", "start": 0.75, "end": 1.5},
    {"id": "backsplash", "start": 1.5, "end": 3.1},
    {"id": "cabinet-wall", "start": 3.1, "end": 3.75},
    {"id": "counter-details", "start": 3.75, "end": 5.75},
]


def clip_lengths_from_stage_durations(stage_ids: list[str]) -> dict[str, int]:
    """
    Models the OLD, wrong request: a clip as long as its own STAGE, which is
    what transformationClips.server.ts used to ask Higgsfield for. It is kept
    because it is exactly the scenario that broke — a clip overrunning the
    interval it is allowed to play across.
    """
    by_id = {s["id"]: s for s in STAGES}
    return {
        sid: frame_at(by_id[sid]["end"], FPS) - frame_at(by_id[sid]["start"], FPS)
        for sid in stage_ids
    }


class TestFrameAt(unittest.TestCase):
    def test_half_frames_round_up_like_javascript_not_like_python(self):
        # Python's built-in round() is half-to-EVEN: round(22.5) == 22, while
        # JavaScript's Math.round(22.5) == 23. Real boundaries land on exactly
        # these values, and the compositor and the TypeScript clip plan have
        # to agree on which frame a boundary is before they can agree on which
        # frames a paid clip may occupy.
        self.assertEqual(frame_at(0.75, 30), 23)  # round() would say 22
        self.assertEqual(frame_at(3.75, 30), 113)  # round() would say 112
        self.assertEqual(frame_at(5.75, 30), 173)
        self.assertEqual(frame_at(6.9, 30), 207)
        self.assertEqual(frame_at(0.0, 30), 0)


class TestClipWindows(unittest.TestCase):
    def test_a_clip_finishes_exactly_on_its_stage_boundary(self):
        # The whole point of the window: from stage.start onward the still
        # already shows the finished state the manifest claims.
        windows = build_clip_windows(STAGES, FPS, clip_lengths_from_stage_durations(["cabinet-wall"]))
        _, end_frame = windows["cabinet-wall"]
        self.assertEqual(end_frame, frame_at(3.1, FPS))

    def test_adjacent_clips_never_share_a_frame(self):
        # Regression: upper-cabinets' 0.75 s clip occupied frames 0-21, then
        # backsplash's 1.6 s clip was clamped to frame 0 and overwrote every
        # one of them. The earlier approved, billed clip appeared in zero
        # frames while the master still credited it.
        lengths = clip_lengths_from_stage_durations(["upper-cabinets", "backsplash"])
        windows = build_clip_windows(STAGES, FPS, lengths)

        upper_start, upper_end = windows["upper-cabinets"]
        back_start, back_end = windows["backsplash"]

        # 0.75 s x 30 fps = 22.5 -> frame 23, half-UP, as Math.round gives in
        # every TypeScript reader of the same manifest. The 22-frame clip ends
        # on that boundary, so it starts at 1.
        self.assertEqual(upper_end, frame_at(0.75, FPS))
        self.assertEqual(upper_end - upper_start, lengths["upper-cabinets"])
        # Backsplash is trimmed to the interval it is allowed to play across
        # instead of reaching back over its predecessor.
        self.assertGreaterEqual(back_start, upper_end)
        self.assertEqual(back_end, frame_at(1.5, FPS))

        schedule = build_clip_schedule(STAGES, FPS, lengths)
        for frame in range(upper_start, upper_end):
            self.assertEqual(schedule[frame][0], "upper-cabinets")
        for frame in range(back_start, back_end):
            self.assertEqual(schedule[frame][0], "backsplash")

    def test_every_approved_clip_reaches_at_least_one_frame(self):
        # If a clip is listed as used, it must actually be shown. This is the
        # claim public/transformation/manifest.json makes.
        every = [s["id"] for s in STAGES if s["id"] != "empty"]
        lengths = clip_lengths_from_stage_durations(every)
        windows = build_clip_windows(STAGES, FPS, lengths)
        self.assertEqual(sorted(windows), sorted(every))
        for stage_id in every:
            start, end = windows[stage_id]
            self.assertGreater(end, start, f"{stage_id} was scheduled zero frames")

    def test_no_frame_is_claimed_twice_across_the_whole_sequence(self):
        lengths = clip_lengths_from_stage_durations([s["id"] for s in STAGES if s["id"] != "empty"])
        schedule = build_clip_schedule(STAGES, FPS, lengths)
        windows = build_clip_windows(STAGES, FPS, lengths)
        self.assertEqual(len(schedule), sum(end - start for start, end in windows.values()))

    def test_an_overlong_clip_is_resampled_across_the_window_not_truncated(self):
        # /v1/image2video/dop takes no duration parameter, so a live clip comes
        # back at the model's default length however short a window the plan
        # asked for. counter-details' interval before it (cabinet-wall,
        # 3.1->3.75) is 0.65 s against a 2.0 s clip. Keeping only the last
        # 0.65 s would discard the placement motion — the object entering and
        # settling — and leave a near-static shot of the arrived object.
        lengths = {"counter-details": 2 * FPS}  # 2.0 s at 30 fps
        schedule = build_clip_schedule(STAGES, FPS, lengths)
        start, end = build_clip_windows(STAGES, FPS, lengths)["counter-details"]

        self.assertEqual(start, frame_at(3.1, FPS))
        self.assertEqual(end, frame_at(3.75, FPS))

        # Both endpoints are kept: the clip's first frame (previous state) and
        # its last (settled new state, landing on the boundary).
        self.assertEqual(schedule[start], ("counter-details", 0))
        self.assertEqual(schedule[end - 1], ("counter-details", lengths["counter-details"] - 1))

        indices = [schedule[f][1] for f in range(start, end)]
        # Monotonic, in range, and actually spanning the clip — never running
        # backwards and never indexing past its last frame.
        self.assertEqual(indices, sorted(indices))
        self.assertGreaterEqual(min(indices), 0)
        self.assertLess(max(indices), lengths["counter-details"])
        # It genuinely samples the whole clip rather than clustering at one
        # end: a 60-frame clip in a 20-frame window advances ~3 frames a step.
        self.assertGreater(max(indices) - min(indices), lengths["counter-details"] * 0.9)

    def test_a_clip_generated_at_the_planned_size_is_used_frame_for_frame(self):
        # Resampling must be the identity when the clip already fits, so a
        # correctly-sized generation is never resampled at all.
        window = frame_at(3.75, FPS) - frame_at(3.1, FPS)
        lengths = {"counter-details": window}
        schedule = build_clip_schedule(STAGES, FPS, lengths)
        start, end = build_clip_windows(STAGES, FPS, lengths)["counter-details"]
        self.assertEqual(
            [schedule[f][1] for f in range(start, end)],
            list(range(window)),
        )

    def test_a_clip_with_no_room_before_its_boundary_is_dropped_not_mis_scheduled(self):
        # The first stage starts at frame 0, so a clip transitioning INTO it
        # has nowhere to play. Better absent from the window map — and so from
        # the master's credits — than silently occupying no frames.
        windows = build_clip_windows(STAGES, FPS, {"empty": 30})
        self.assertNotIn("empty", windows)

    def test_clips_sized_the_way_the_plan_now_asks_fit_with_nothing_trimmed(self):
        # transformationClips.server.ts quotes windowSec as the window's own
        # frame count. Generating against that number must waste nothing: no
        # clip trimmed, no frame of a paid generation discarded.
        lengths = {}
        for index, stage in enumerate(STAGES):
            if index == 0:
                continue
            lengths[stage["id"]] = frame_at(stage["start"], FPS) - frame_at(STAGES[index - 1]["start"], FPS)

        windows = build_clip_windows(STAGES, FPS, lengths)
        self.assertEqual(sorted(windows), sorted(lengths))
        for stage_id, (start, end) in windows.items():
            self.assertEqual(end - start, lengths[stage_id], f"{stage_id} was trimmed")

        schedule = build_clip_schedule(STAGES, FPS, lengths)
        # Every frame of every clip is used, first to last.
        for stage_id, (start, end) in windows.items():
            self.assertEqual(schedule[start], (stage_id, 0))
            self.assertEqual(schedule[end - 1], (stage_id, lengths[stage_id] - 1))

    def test_a_shorter_clip_keeps_its_own_length(self):
        # Trimming only applies when the clip overruns; a clip that fits sits
        # flush against its boundary and keeps every frame.
        lengths = {"counter-details": 10}
        start, end = build_clip_windows(STAGES, FPS, lengths)["counter-details"]
        self.assertEqual(end - start, 10)
        self.assertEqual(end, frame_at(3.75, FPS))


class TestClipLanding(unittest.TestCase):
    """
    The clip must ARRIVE at the still the compositor cuts to.

    Nothing in a clip request names the authored target render — the provider
    gets the previous stage's still and a differential prompt — so a clip can
    settle its object slightly off and the compositor's very next frame (the
    authored still) pops. These guard the dissolve that removes that by
    construction.
    """

    ALL = {"upper-cabinets": 20, "backsplash": 40, "cabinet-wall": 12, "counter-details": 60}

    def test_every_window_lands_exactly_on_the_target_still(self):
        # The claim, end to end: the last frame the clip occupies IS the stage
        # still, so the cut to it on the next frame changes nothing.
        landing = build_clip_landing(STAGES, FPS, self.ALL)
        windows = build_clip_windows(STAGES, FPS, self.ALL)
        self.assertTrue(windows)
        for stage_id, (_start, end) in windows.items():
            self.assertAlmostEqual(landing[end - 1], 1.0, msg=f"{stage_id} never reaches its still")

    def test_the_dissolve_only_touches_the_tail_of_its_window(self):
        # The paid placement motion is what the viewer is there for; blending
        # it away across the whole window would waste the generation.
        landing = build_clip_landing(STAGES, FPS, self.ALL)
        for stage_id, (start, end) in build_clip_windows(STAGES, FPS, self.ALL).items():
            window = end - start
            span = min(CLIP_LANDING_FRAMES, window)
            self.assertGreater(window, span, f"{stage_id} needs a window worth testing")
            for frame in range(start, end - span):
                self.assertNotIn(frame, landing, f"{stage_id} frame {frame} should be untouched")
            for frame in range(end - span, end):
                self.assertIn(frame, landing, f"{stage_id} frame {frame} should be dissolving")

    def test_the_dissolve_is_monotonic_and_bounded(self):
        landing = build_clip_landing(STAGES, FPS, self.ALL)
        for _stage_id, (start, end) in build_clip_windows(STAGES, FPS, self.ALL).items():
            weights = [landing[f] for f in range(start, end) if f in landing]
            for earlier, later in zip(weights, weights[1:]):
                self.assertLess(earlier, later)
            self.assertGreater(weights[0], 0.0)
            self.assertLessEqual(weights[-1], 1.0)

    def test_it_never_reaches_outside_its_own_window(self):
        # The window floor keeps clips disjoint; a ramp that started before its
        # window would blend a target still over the PREVIOUS stage's frames.
        landing = build_clip_landing(STAGES, FPS, self.ALL)
        owned = {
            frame
            for (start, end) in build_clip_windows(STAGES, FPS, self.ALL).values()
            for frame in range(start, end)
        }
        self.assertTrue(set(landing).issubset(owned))

    def test_a_window_shorter_than_the_ramp_still_lands(self):
        # Shrink the ramp, never the guarantee.
        lengths = {"counter-details": 3}
        landing = build_clip_landing(STAGES, FPS, lengths)
        start, end = build_clip_windows(STAGES, FPS, lengths)["counter-details"]
        self.assertEqual(end - start, 3)
        self.assertAlmostEqual(landing[end - 1], 1.0)
        self.assertEqual(sorted(landing), list(range(start, end)))

    def test_a_single_frame_window_is_just_the_still(self):
        lengths = {"counter-details": 1}
        landing = build_clip_landing(STAGES, FPS, lengths)
        start, end = build_clip_windows(STAGES, FPS, lengths)["counter-details"]
        self.assertEqual(end - start, 1)
        self.assertAlmostEqual(landing[start], 1.0)

    def test_stages_without_a_clip_carry_no_weight(self):
        # A frame drawn from the stage still must never be blended with itself
        # at some partial weight — it is already the target.
        landing = build_clip_landing(STAGES, FPS, {"backsplash": 20})
        start, end = build_clip_windows(STAGES, FPS, {"backsplash": 20})["backsplash"]
        self.assertTrue(all(start <= f < end for f in landing))

    def test_the_landing_agrees_with_the_schedule_frame_for_frame(self):
        # Both are read in the same loop of the compositor; a frame carrying a
        # landing weight but no scheduled clip frame would blend against
        # nothing, and the reverse would cut instead of landing.
        landing = build_clip_landing(STAGES, FPS, self.ALL)
        schedule = build_clip_schedule(STAGES, FPS, self.ALL)
        self.assertTrue(set(landing).issubset(set(schedule)))
        for frame, weight in landing.items():
            stage_id, _clip_index = schedule[frame]
            _start, end = build_clip_windows(STAGES, FPS, self.ALL)[stage_id]
            if frame == end - 1:
                self.assertAlmostEqual(weight, 1.0)


if __name__ == "__main__":
    unittest.main()

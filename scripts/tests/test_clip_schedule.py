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

from clip_schedule import build_clip_schedule, build_clip_windows, frame_at  # noqa: E402

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

    def test_an_overlong_clip_is_trimmed_from_the_head_not_the_tail(self):
        # counter-details' interval before it (cabinet-wall, 3.1->3.75) is
        # 0.65 s, far shorter than its own 2.0 s clip: the frames that survive
        # must be the clip's LAST ones, so its final frame lands on 3.75.
        lengths = {"counter-details": 2 * FPS}  # 2.0 s at 30 fps
        schedule = build_clip_schedule(STAGES, FPS, lengths)
        start, end = build_clip_windows(STAGES, FPS, lengths)["counter-details"]

        self.assertEqual(start, frame_at(3.1, FPS))
        self.assertEqual(end, frame_at(3.75, FPS))
        self.assertEqual(schedule[end - 1], ("counter-details", lengths["counter-details"] - 1))
        self.assertEqual(schedule[start], ("counter-details", lengths["counter-details"] - (end - start)))
        # Never a negative index into the clip's frame list.
        for frame in range(start, end):
            self.assertGreaterEqual(schedule[frame][1], 0)

    def test_a_clip_with_no_room_before_its_boundary_is_dropped_not_mis_scheduled(self):
        # The first stage starts at frame 0, so a clip transitioning INTO it
        # has nowhere to play. Better absent from the window map — and so from
        # the master's credits — than silently occupying no frames.
        windows = build_clip_windows(STAGES, FPS, {"empty": 30})
        self.assertNotIn("empty", windows)

    def test_clips_sized_the_way_the_plan_now_asks_fit_with_nothing_trimmed(self):
        # transformationClips.server.ts quotes durationSec as the window's own
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


if __name__ == "__main__":
    unittest.main()

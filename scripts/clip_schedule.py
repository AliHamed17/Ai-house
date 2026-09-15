"""
Frame scheduling for the transformation compositor's approved micro-clips.

Deliberately stdlib-only, with no numpy/pillow/ffmpeg import, so CI can unit
test it (scripts/tests/test_clip_schedule.py) without installing anything the
compositor itself needs.

A clip for stage S is the transition INTO S: it animates from the previous
stage's state into S's state, so it has to FINISH exactly on S's start
boundary. From that frame onward the stage still already shows the completed
state that the manifest, the hand timing and the 3D handoff all report.

The rule that makes that safe is the window floor. A clip may only play across
the interval IMMEDIATELY BEFORE its stage, so every window lives inside
[previous.start, stage.start) — and those intervals are disjoint, so two clips
can never claim the same frame.
"""

from __future__ import annotations

import math


def frame_at(seconds: float, fps: int) -> int:
    """
    Frame index a stage boundary falls on.

    Half-UP, deliberately not Python's built-in round(), which is half-to-even:
    several real boundaries land exactly on a half frame (0.75 s x 30 = 22.5,
    3.75 s x 30 = 112.5), and banker's rounding would place them one frame
    earlier here than JavaScript's Math.round places them in every TypeScript
    consumer of the same manifest. The two layers have to agree on which frame
    a boundary IS before they can agree on which frames a clip may occupy.
    """
    return math.floor(seconds * fps + 0.5)


def build_clip_windows(
    stages: list[dict],
    fps: int,
    clip_lengths: dict[str, int],
) -> dict[str, tuple[int, int]]:
    """
    Half-open [start_frame, end_frame) window each stage's clip occupies.

    Stages with no clip, and clips with no room before their boundary, are
    absent from the result — so the caller can report exactly which stages a
    generated clip actually reached, rather than which ones had one on disk.
    """
    windows: dict[str, tuple[int, int]] = {}
    for index, stage in enumerate(stages):
        length = clip_lengths.get(stage["id"], 0)
        if length <= 0:
            continue
        end_frame = frame_at(stage["start"], fps)
        # Clamping the head to the PREVIOUS stage's start rather than to frame
        # 0 is what keeps the windows disjoint. A clip's length is whatever the
        # provider chose to return, which can easily exceed the interval before
        # it — and once exceeded it by construction, back when the plan asked
        # for a clip as long as its own stage: backsplash's 1.6 s clip reached
        # past upper-cabinets' 0.75 s window entirely and, written into the
        # same map, erased it. An approved, billed clip then never appeared in
        # a single frame while the master still credited it.
        floor_frame = frame_at(stages[index - 1]["start"], fps) if index > 0 else 0
        start_frame = max(floor_frame, end_frame - length)
        if start_frame >= end_frame:
            continue
        windows[stage["id"]] = (start_frame, end_frame)
    return windows


def build_clip_schedule(
    stages: list[dict],
    fps: int,
    clip_lengths: dict[str, int],
) -> dict[int, tuple[str, int]]:
    """
    Map master frame index -> (stage id, index of the clip frame to draw).

    A clip longer than its window is RESAMPLED across the window, never
    truncated. The endpoint the provider actually exposes
    (/v1/image2video/dop) takes no duration parameter at all, so a live clip
    comes back at the model's own default length regardless of what the plan
    asked for. Keeping only the window's worth of tail frames would then throw
    away the placement motion itself — the object entering and settling, which
    is the entire reason the clip was generated and paid for — and leave a
    near-static shot of the already-arrived object. Sampling the whole clip
    into the window keeps every beat of that motion, just played at the
    window's pace.

    Raises if two clips ever claim the same frame. Construction above makes
    that impossible; the check is here so a future change to the floor rule
    fails loudly instead of silently dropping someone's paid generation again.
    """
    schedule: dict[int, tuple[str, int]] = {}
    for stage_id, (start_frame, end_frame) in build_clip_windows(stages, fps, clip_lengths).items():
        length = clip_lengths[stage_id]
        window = end_frame - start_frame
        for offset, frame_index in enumerate(range(start_frame, end_frame)):
            if frame_index in schedule:
                raise ValueError(
                    f"clip windows overlap at frame {frame_index}: "
                    f"{schedule[frame_index][0]} and {stage_id}"
                )
            # Endpoint-inclusive linear resample: offset 0 takes the clip's
            # first frame (the previous stage's state) and the last offset
            # takes its last (the settled new state), which is the frame that
            # has to land on the boundary. When window == length this is the
            # identity map, so a clip generated at the planned size is used
            # exactly as delivered.
            clip_index = (
                round(offset * (length - 1) / (window - 1)) if window > 1 else length - 1
            )
            schedule[frame_index] = (stage_id, clip_index)
    return schedule

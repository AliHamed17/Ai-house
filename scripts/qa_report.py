"""
The pass/fail rules and JSON-safety helpers behind scripts/qa-contact-sheet.py.

Deliberately its own stdlib-only module, like clip_schedule.py and
gesture_timing.py: the rules that decide whether `npm run transformation:qa`
fails are exactly the part worth testing, and testing them inside the contact
sheet script would drag numpy, pillow and ffmpeg into CI to assert on three
numbers. See scripts/tests/test_qa_report.py.
"""

from __future__ import annotations

import math

# Below this, the result's luminance arc across the lighting-only stages is no
# longer recognisably the reference's, and the QA command fails.
#
# This is a floor, not a target: the measured value is 0.9969, so an arc that
# merely differs a little in shape still passes comfortably. What it exists to
# catch is the category of regression that the previous exit predicate let
# through entirely -- an arc running backwards (strongly negative), or an arc
# that isn't an arc at all. Only three stages are lighting-only
# (daylight-dimming -> dusk -> warm-evening), so the statistic is coarse by
# construction; a tighter bound would start failing on rounding rather than on
# anything a viewer could see.
MIN_LIGHTING_ARC_CORRELATION = 0.9

# Two points always correlate perfectly, so a correlation over fewer than
# three lighting-only stages measures nothing at all -- and with fewer than two
# numpy cannot produce a number in the first place. If the reference analysis
# ever stops having at least this many, the audit has silently stopped
# measuring the thing it claims to measure and must say so rather than pass.
MIN_LIGHTING_ARC_SAMPLES = 3


def json_number(value: float) -> float | None:
    """
    A correlation rounded for the report, or None when it is not a real number.

    json.dumps writes a float('nan') as a bare `NaN` token, which is NOT valid
    JSON: every strict parser rejects the file outright, so a report that
    happened to contain one could not be read by the very reviewers it exists
    for. `null` is both valid and the honest answer -- the measurement has no
    value, rather than a value that happens to be unrepresentable.
    """
    if not math.isfinite(value):
        return None
    return round(value, 4)


def lighting_arc_problems(correlation: float, sample_count: int) -> list[str]:
    """
    Every reason the measured lighting arc fails the audit; empty means it passes.

    Mirrors the timing audit's own problem-list shape so the caller can treat
    both the same way -- report them, then exit non-zero. Before this existed,
    the command's exit status ignored the lighting measurement completely: a
    regenerated video keeping the same manifest but rendering the arc
    backwards, flat, or fully black kept every timing check green and exited 0,
    publishing a broken result with a QA report that (in the flat and black
    cases) wasn't even parseable JSON.
    """
    if sample_count < MIN_LIGHTING_ARC_SAMPLES:
        return [
            f"Only {sample_count} lighting-only stage(s) available; "
            f"at least {MIN_LIGHTING_ARC_SAMPLES} are needed to measure the lighting arc at all."
        ]
    if not math.isfinite(correlation):
        return [
            "Lighting-arc correlation is not a number, which means the measured luminance "
            "does not vary across the lighting-only stages — a flat, fully black, or frozen "
            "render produces exactly this."
        ]
    if correlation < MIN_LIGHTING_ARC_CORRELATION:
        return [
            f"Lighting-arc correlation {correlation:.4f} is below the required "
            f"{MIN_LIGHTING_ARC_CORRELATION}; the result no longer follows the reference's "
            "lighting arc (a reversed arc reads as a negative value)."
        ]
    return []


# How far the PUBLISHED file's own duration may sit from the reference before
# the audit fails.
#
# Sized from the two roundings between them, not picked for feel. The
# compositor writes round(duration * fps) frames, so the real file can land up
# to 0.5/fps = 0.017 s from the authored duration at 30 fps, and ffmpeg
# reports to a centisecond, adding up to 0.005 s. 0.05 s covers both several
# times over while still being far below any truncation a viewer could see:
# the case this exists to catch is a file seconds short, not milliseconds.
MAX_DURATION_DRIFT_SEC = 0.05

# The tolerance above is a documented promise: a file exactly that far out
# passes. Binary floating point does not agree by itself — 13.37 + 0.05 is
# 13.420000000000002, whose distance from 13.37 is a hair OVER 0.05 — so a
# value sitting precisely on the stated boundary would fail on representation
# rather than on anything about the video. This slack makes the boundary
# inclusive as written, and is many orders of magnitude below the drift it
# would take to matter.
_DURATION_EPSILON_SEC = 1e-9


def _drifts(measured: float, target: float) -> bool:
    return abs(measured - target) > MAX_DURATION_DRIFT_SEC + _DURATION_EPSILON_SEC


def parse_ffmpeg_duration(stderr: str) -> float | None:
    """
    Seconds from an ffmpeg banner's `Duration: HH:MM:SS.ss` line, or None.

    ffmpeg writes this to stderr when asked to describe a file, which is the
    one reading of the PUBLISHED artifact available without adding ffprobe as
    a dependency. Returns None rather than raising when the line is absent or
    malformed, so the caller can report "could not measure" as its own
    distinct problem instead of a crash mid-audit.
    """
    for line in stderr.splitlines():
        marker = "Duration:"
        at = line.find(marker)
        if at == -1:
            continue
        value = line[at + len(marker) :].split(",")[0].strip()
        parts = value.split(":")
        if len(parts) != 3:
            continue
        try:
            hours, minutes, seconds = (float(p) for p in parts)
        except ValueError:
            continue
        if not all(math.isfinite(x) for x in (hours, minutes, seconds)):
            continue
        return hours * 3600 + minutes * 60 + seconds
    return None


def duration_problems(
    measured: float | None,
    reference: float,
    claimed: float | None,
) -> list[str]:
    """
    Whether the PUBLISHED video is as long as it is supposed to be.

    Every other check in this audit reads the sidecar manifest the compositor
    wrote, so a master that is later truncated, extended or swapped without
    regenerating that manifest was audited entirely against its own paperwork:
    the stage timings still lined up, and the lighting correlation could still
    pass, because luminance is sampled at stage midpoints and a file cut just
    after the last one still has every sample it needs.

    `measured` therefore comes from the file; `claimed` is what the manifest
    says. Both are compared — against the reference, and against each other,
    since a disagreement between them means the two have come apart even when
    each looks individually plausible.
    """
    problems: list[str] = []

    if measured is None:
        problems.append(
            "Could not measure the published video's own duration, so its length is unverified."
        )
    elif _drifts(measured, reference):
        problems.append(
            f"Published video is {measured:.2f}s but the reference is {reference:.2f}s "
            f"(tolerance {MAX_DURATION_DRIFT_SEC}s)."
        )

    if measured is not None and claimed is not None and _drifts(measured, float(claimed)):
        problems.append(
            f"Published video is {measured:.2f}s but its manifest claims {float(claimed):.2f}s — "
            "the file and the manifest describing it have come apart; re-run the compositor."
        )

    return problems

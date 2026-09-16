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

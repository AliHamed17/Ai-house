"""
Timing math for the transformation's hand gestures.

Stdlib-only (like clip_schedule.py) so CI can unit test it without numpy or
pillow, which hand_layer.py needs but this arithmetic does not.

Both functions exist to protect one invariant: the hand's action instant and
the object's appearance are the SAME moment. The reference video holds them
within one 50 ms sample at every stage boundary, so anything that shifts them
apart — or that makes the hand arrive twice — breaks the cause-and-effect the
whole sequence is built on.
"""

from __future__ import annotations


def travel_for_progress(progress: float) -> float:
    """
    Gesture progress (0 entering, 0.5 acting, 1 withdrawn) -> travel 0..1.

    Monotonic, and passing through exactly 0.5 at progress 0.5, because
    gesture_path() folds travel around 0.5 (`t = 1 - |travel - 0.5| * 2`) to
    place the action point. Each half therefore has to stay inside its own
    half of the range.

    The earlier pair, `1 - (1 - p)**2` below 0.5 and `p**2` above, had the
    right SHAPES but the wrong ranges: the first half climbed to 0.75 and the
    second restarted at 0.25. Travel then crossed 0.5 twice, so the hand
    reached the action point at roughly 29% and again at 71% — two approaches
    and two retreats — and at the documented action instant it was only half
    way there.
    """
    if progress < 0.5:
        # Ease out into the action: quick on entry, decelerating to a stop at
        # the moment the object lands.
        return 0.5 * (1.0 - (1.0 - 2.0 * progress) ** 2)
    # Ease in on the way out: accelerating away again.
    return 0.5 + 0.5 * (2.0 * progress - 1.0) ** 2


def gesture_progress(t: float, stage_start: float, lead_sec: float, trail_sec: float) -> float:
    """
    Wall-clock time -> gesture progress, pinning progress 0.5 to stage_start.

    The lead and trail are deliberately NOT equal — the measured hand
    approaches for longer than it withdraws — so a single linear ramp across
    the window put the action instant at the window's midpoint, which is
    (trail - lead) / 2 = 50 ms BEFORE the boundary rather than on it. At 30 fps
    that is a two-frame gap between the hand placing an object and the object
    appearing, outside the reference's own 50 ms tolerance.

    Mapping each side separately keeps the measured asymmetry and still lands
    the action exactly on the boundary.
    """
    if t <= stage_start:
        if lead_sec <= 0:
            return 0.5
        return 0.5 * (t - (stage_start - lead_sec)) / lead_sec
    if trail_sec <= 0:
        return 1.0
    return 0.5 + 0.5 * (t - stage_start) / trail_sec

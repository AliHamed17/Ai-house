"""
Deterministic hand-gesture layer for the room transformation sequence.

The reference's hand is its user interface: each gesture *causes* the change
that lands on the same frame. Reproducing that with a generative video model
is exactly where those models fail worst (six fingers, melting wrists, a hand
that occludes the very geometry that must stay stable), so this draws the
hand procedurally instead.

Every hand here is built from the same anatomically-proportioned rig -- palm
plus four fingers plus an opposed thumb, at real-ish relative lengths -- so it
can be posed and animated but can never come out malformed. Soft edges and a
contact shadow do the rest of the work at the scale the reference uses (hand
close to the lens, large in frame, moving).

Gesture vocabulary matches analysis/reference-transformation-video.json's
`gestureGrammar`, which is the measured reading of the reference.
"""

from __future__ import annotations

import math
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

sys.path.insert(0, str(Path(__file__).resolve().parent))
from gesture_timing import travel_for_progress  # noqa: E402

# Warm neutral skin tone, kept deliberately desaturated so the hand reads as a
# silhouette-with-form rather than competing with the room's palette.
SKIN = (214, 176, 148)
SKIN_SHADE = (176, 138, 112)
SKIN_LIGHT = (236, 205, 180)

# Relative finger lengths (index, middle, ring, little) as fractions of palm
# length -- real proportions, which is most of what makes a drawn hand read
# as a hand rather than a mitten.
FINGER_LENGTHS = (0.92, 1.0, 0.92, 0.74)
FINGER_SPREAD_DEG = (-11.0, -3.5, 4.0, 12.5)


def _capsule(draw: ImageDraw.ImageDraw, p0, p1, r, fill):
    """A rounded line segment -- the building block for every finger bone."""
    draw.line([p0, p1], fill=fill, width=int(r * 2), joint="curve")
    for p in (p0, p1):
        draw.ellipse([p[0] - r, p[1] - r, p[0] + r, p[1] + r], fill=fill)


def _rot(px, py, cx, cy, deg):
    a = math.radians(deg)
    dx, dy = px - cx, py - cy
    return (cx + dx * math.cos(a) - dy * math.sin(a), cy + dx * math.sin(a) + dy * math.cos(a))


def draw_hand(
    size: tuple[int, int],
    cx: float,
    cy: float,
    scale: float,
    rotation_deg: float = 0.0,
    curl: float = 0.0,
    pinch: float = 0.0,
    spread: float = 1.0,
) -> Image.Image:
    """
    Render one hand pose onto a transparent RGBA layer.

    cx, cy      -- fingertip/action point in pixels: the place the gesture is
                   "touching", so callers can aim a gesture at an object.
    scale       -- palm length in pixels.
    rotation_deg-- whole-hand rotation; 0 points the fingers up.
    curl        -- 0 flat/open, 1 fully curled (used for placing gestures).
    pinch       -- 0 open, 1 thumb and index tip meeting (discrete objects).
    spread      -- lateral finger splay multiplier (1 natural, >1 fanned).
    """
    w, h = size
    layer = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)

    palm_len = scale
    palm_w = scale * 0.78
    # The action point is the index fingertip, so the wrist is placed back
    # down the hand's axis from it.
    reach = palm_len * (0.95 + FINGER_LENGTHS[0] * (1.0 - curl * 0.55))
    wx, wy = _rot(cx, cy + reach, cx, cy, rotation_deg)

    # --- forearm, running off the frame edge so the hand always has a body ---
    far = palm_len * 7.0
    fx, fy = _rot(cx, cy + reach + far, cx, cy, rotation_deg)
    _capsule(d, (wx, wy), (fx, fy), palm_w * 0.46, SKIN_SHADE)

    # --- palm ---
    pcx, pcy = _rot(cx, cy + reach - palm_len * 0.5, cx, cy, rotation_deg)
    _capsule(
        d,
        _rot(pcx, pcy - palm_len * 0.22, pcx, pcy, rotation_deg),
        _rot(pcx, pcy + palm_len * 0.22, pcx, pcy, rotation_deg),
        palm_w * 0.5,
        SKIN,
    )

    knuckle_y = pcy - palm_len * 0.34

    # --- four fingers ---
    for i, flen in enumerate(FINGER_LENGTHS):
        off = (i - 1.5) * palm_w * 0.27 * spread
        kx, ky = _rot(pcx + off, knuckle_y, pcx, pcy, rotation_deg)
        # A pinch closes the index; the others keep a natural relaxed curl.
        f_curl = curl
        if pinch > 0:
            f_curl = min(1.0, curl + (pinch * 0.85 if i == 0 else pinch * 0.55))
        length = palm_len * flen * (1.0 - f_curl * 0.5)
        ang = rotation_deg + FINGER_SPREAD_DEG[i] * spread + f_curl * 26.0
        tipx = kx + math.sin(math.radians(ang)) * length
        tipy = ky - math.cos(math.radians(ang)) * length
        # Two phalanges so the finger has a visible joint break rather than
        # reading as a straight stick.
        midx = kx + (tipx - kx) * 0.55
        midy = ky + (tipy - ky) * 0.55
        r = palm_w * (0.150 if i != 3 else 0.128)
        _capsule(d, (kx, ky), (midx, midy), r, SKIN)
        _capsule(d, (midx, midy), (tipx, tipy), r * 0.88, SKIN_LIGHT)

    # --- opposed thumb, off the radial side ---
    t_base_x, t_base_y = _rot(pcx - palm_w * 0.46, pcy + palm_len * 0.06, pcx, pcy, rotation_deg)
    t_ang = rotation_deg - 52.0 + pinch * 34.0
    t_len = palm_len * 0.62
    t_mid = (
        t_base_x + math.sin(math.radians(t_ang)) * t_len * 0.55,
        t_base_y - math.cos(math.radians(t_ang)) * t_len * 0.55,
    )
    t_tip = (
        t_base_x + math.sin(math.radians(t_ang)) * t_len,
        t_base_y - math.cos(math.radians(t_ang)) * t_len,
    )
    _capsule(d, (t_base_x, t_base_y), t_mid, palm_w * 0.175, SKIN)
    _capsule(d, t_mid, t_tip, palm_w * 0.148, SKIN_LIGHT)

    # Form shading: without a light gradient the hand reads as a flat paper
    # cut-out. Brighter toward the fingertips (which face the room's light),
    # falling off toward the wrist, matches how a hand held near the lens is
    # actually lit and is most of what sells the shape as three-dimensional.
    import numpy as np

    rgba = np.asarray(layer, dtype=np.float32)
    h_px, w_px = rgba.shape[:2]
    ax = math.sin(math.radians(rotation_deg))
    ay = -math.cos(math.radians(rotation_deg))
    ys, xs = np.mgrid[0:h_px, 0:w_px]
    along = ((xs - cx) * ax + (ys - cy) * ay) / max(scale * 2.2, 1.0)
    shade = np.clip(1.16 - 0.42 * np.clip(along, 0.0, 1.6), 0.62, 1.16)
    rgba[..., :3] *= shade[..., None]
    np.clip(rgba, 0, 255, out=rgba)
    shaded = Image.fromarray(rgba.astype(np.uint8), "RGBA")

    # Close to the lens means well outside the focal plane: a crisp vector
    # edge would read as a sticker pasted over the render.
    return shaded.filter(ImageFilter.GaussianBlur(max(2.6, scale * 0.042)))


def gesture_pose(gesture: str, progress: float) -> dict:
    """
    Map a gesture name and 0..1 progress to pose parameters.

    progress 0 = entering, 0.5 = the action instant (the frame on which the
    object appears), 1 = fully withdrawn.
    """
    # Ease so the hand decelerates into the action and accelerates away,
    # which is what makes the cause->effect read as deliberate. Monotonic and
    # centred on 0.5 — see scripts/gesture_timing.py for why both matter.
    e = travel_for_progress(progress)
    near = 1.0 - abs(progress - 0.5) * 2.0  # 0 at the edges, 1 at the action

    if gesture == "open-hand-sweep":
        return {"curl": 0.05, "pinch": 0.0, "spread": 1.05, "rotation_deg": 8.0, "travel": e}
    if gesture == "pinch-drag":
        return {"curl": 0.18, "pinch": 0.25 + 0.65 * near, "spread": 0.78, "rotation_deg": -14.0, "travel": e}
    if gesture == "horizontal-sweep":
        return {"curl": 0.08, "pinch": 0.0, "spread": 0.95, "rotation_deg": 74.0, "travel": e}
    if gesture == "two-sided-placement":
        return {"curl": 0.3, "pinch": 0.1, "spread": 0.88, "rotation_deg": -6.0, "travel": e}
    if gesture == "repeated-pinch":
        return {"curl": 0.22, "pinch": 0.35 + 0.6 * near, "spread": 0.74, "rotation_deg": -18.0, "travel": e}
    if gesture == "pinch-from-ceiling":
        return {"curl": 0.2, "pinch": 0.3 + 0.6 * near, "spread": 0.74, "rotation_deg": 178.0, "travel": e}
    if gesture == "two-finger-place":
        return {"curl": 0.42, "pinch": 0.2 + 0.3 * near, "spread": 0.66, "rotation_deg": -10.0, "travel": e}
    return {"curl": 0.1, "pinch": 0.0, "spread": 0.88, "rotation_deg": 0.0, "travel": e}


def gesture_path(gesture_from: str, travel: float, w: int, h: int) -> tuple[float, float]:
    """
    Where the action point sits for a gesture entering from a given edge.

    The hand always comes in from outside the frame, reaches roughly the
    optical centre of the action, and leaves the same way -- it never
    materialises mid-frame, and never crosses the whole composition.
    """
    # travel 0 -> off-frame, 0.5 -> action point, 1 -> off-frame again
    t = 1.0 - abs(travel - 0.5) * 2.0
    if gesture_from == "top":
        return (w * 0.5, -h * 0.16 + (h * 0.52) * t)
    if gesture_from == "right":
        return (w * 1.16 - (w * 0.72) * t, h * 0.5)
    if gesture_from == "left":
        return (-w * 0.16 + (w * 0.72) * t, h * 0.5)
    return (w * 0.5, h * 1.16 - (h * 0.6) * t)


def render_gesture(size: tuple[int, int], gesture: str, gesture_from: str, progress: float) -> Image.Image | None:
    """The full hand layer for one frame, or None when nothing should show."""
    if gesture == "none" or gesture_from is None:
        return None
    if progress <= 0.0 or progress >= 1.0:
        return None
    w, h = size
    pose = gesture_pose(gesture, progress)
    cx, cy = gesture_path(gesture_from, pose["travel"], w, h)
    layer = draw_hand(
        size,
        cx,
        cy,
        scale=w * 0.34,
        rotation_deg=pose["rotation_deg"],
        curl=pose["curl"],
        pinch=pose["pinch"],
        spread=pose["spread"],
    )
    # A hand clipped down to a few floating fingertips at the frame edge reads
    # as a glitch, so the first and last beats of every gesture fade instead
    # of popping in at their most-cropped pose.
    edge = min(progress, 1.0 - progress) / 0.22
    if edge < 1.0:
        import numpy as np

        arr = np.asarray(layer, dtype=np.float32)
        arr[..., 3] *= max(0.0, edge) ** 1.5
        layer = Image.fromarray(arr.astype(np.uint8), "RGBA")
    return layer

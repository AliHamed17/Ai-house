"""
Deterministic assembly of the room transformation master video.

Nothing here is generative. Every frame is composed from:
  - the locked-camera stage still rendered from the real 3D house
    (scripts/render-stage-stills.mjs),
  - the exposure envelope measured off the reference video, applied
    *relative to each stage* so the reference's emotional arc is reproduced
    numerically without double-counting the lighting already baked into the
    render,
  - the procedural hand layer (scripts/hand_layer.py),
  - approved Higgsfield micro-clips, when public/transformation/clips.json
    lists one for a stage and marks it approved (see
    src/lib/ai/transformationClips.server.ts). A clip supplies only that
    stage's motion; exposure, hand compositing and every cut point stay
    compositor-controlled.

That is the point: edit timing, cut points, hand masking and total duration
are facts the compositor controls exactly, and no model gets a vote on them.

Usage:
    python3 scripts/compose-transformation.py \
        [--stills .transformation-work/stages] \
        [--base http://localhost:3000] \
        [--out public/transformation]

Requires: pillow, numpy, imageio-ffmpeg (pip install pillow numpy imageio-ffmpeg)
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
import urllib.request
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
from clip_schedule import (  # noqa: E402
    CLIP_LANDING_FRAMES,
    build_clip_landing,
    build_clip_schedule,
    build_clip_windows,
)
from clip_assets import resolve_approved_clip_source  # noqa: E402
from gesture_timing import gesture_progress, gesture_windows  # noqa: E402
from hand_layer import render_gesture  # noqa: E402

# The hand arrives shortly before the object lands and leaves shortly after.
# Measured from the reference: the gesture peak and the object's appearance
# fall within one 50 ms sample of each other at every stage boundary, so the
# peak is pinned exactly to the stage start.
HAND_LEAD_SEC = 0.45
HAND_TRAIL_SEC = 0.35


def fetch_manifest(base: str) -> dict:
    with urllib.request.urlopen(f"{base}/api/transformation/manifest", timeout=20) as r:
        return json.loads(r.read().decode())


def stage_at(stages: list[dict], t: float) -> dict:
    for s in stages:
        if s["start"] <= t < s["end"]:
            return s
    return stages[-1]


def exposure_at(envelope: list[tuple[float, float]], t: float) -> float:
    if t <= envelope[0][0]:
        return envelope[0][1]
    for i in range(1, len(envelope)):
        (ta, ea), (tb, eb) = envelope[i - 1], envelope[i]
        if t <= tb:
            span = tb - ta
            if span <= 0:
                return eb
            k = (t - ta) / span
            return ea + (eb - ea) * k
    return envelope[-1][1]


def apply_exposure(arr: np.ndarray, factor: float) -> np.ndarray:
    """
    Scale exposure with a soft shoulder so a brightening pass rolls off
    instead of clipping the worktop and the lit cabinet interiors to flat
    white, which is what a plain multiply does at the warm reveal.
    """
    if abs(factor - 1.0) < 1e-3:
        return arr
    x = arr.astype(np.float32) / 255.0
    x = x * factor
    if factor > 1.0:
        x = x / (1.0 + (factor - 1.0) * np.clip(x - 0.55, 0, None) * 1.6)
    return np.clip(x * 255.0, 0, 255).astype(np.uint8)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--stills", default=".transformation-work/stages")
    ap.add_argument("--base", default="http://localhost:3000")
    ap.add_argument("--out", default="public/transformation")
    ap.add_argument("--work", default=".transformation-work/frames")
    args = ap.parse_args()

    manifest = fetch_manifest(args.base)
    if not manifest["valid"]:
        print("Manifest invalid, refusing to compose:", manifest["problems"], file=sys.stderr)
        return 1

    stages = manifest["stages"]
    duration = float(manifest["durationSec"])
    fps = int(manifest["output"]["fps"])
    width = int(manifest["output"]["widthPx"])
    height = int(manifest["output"]["heightPx"])

    stills_dir = Path(args.stills)
    index_path = stills_dir / "stills.json"
    if not index_path.exists():
        print(f"No stills at {index_path}. Run scripts/render-stage-stills.mjs first.", file=sys.stderr)
        return 1
    stills_index = json.loads(index_path.read_text())

    # The measured exposure envelope comes from the manifest endpoint, which
    # serves LIGHTING_ENVELOPE straight out of the same TypeScript module the
    # app and the tests read. A local copy here would mean editing the
    # envelope changed playback metadata and tests but not the rendered video.
    raw_envelope = manifest.get("lightingEnvelope")
    if not raw_envelope:
        print("Manifest served no lightingEnvelope; refusing to fall back to a local copy.", file=sys.stderr)
        return 1
    envelope = [(float(p["t"]), float(p["exposure"])) for p in raw_envelope]

    # --- approved Higgsfield micro-clips ------------------------------------
    # A generated clip is only used once it is listed AND marked approved, so a
    # billed-but-rejected generation never silently reaches the master.
    clips_index = Path("public/transformation/clips.json")
    clip_frames: dict[str, list[Path]] = {}
    if clips_index.exists():
        import imageio_ffmpeg as _iio

        ffmpeg_bin = _iio.get_ffmpeg_exe()
        clip_meta = json.loads(clips_index.read_text())
        clip_work = Path(args.work).parent / "clip-frames"
        clip_work.mkdir(parents=True, exist_ok=True)
        for clip in clip_meta.get("clips", []):
            if not clip.get("approved"):
                continue
            # Fatal when it cannot be found — see clip_assets for why a paid,
            # approved clip must never be skipped past.
            src = resolve_approved_clip_source(str(clip.get("stageId")), str(clip.get("file", "")))
            out = clip_work / str(clip["stageId"])
            out.mkdir(parents=True, exist_ok=True)
            for old in out.glob("*.png"):
                old.unlink()
            subprocess.run(
                [ffmpeg_bin, "-v", "error", "-i", str(src), "-vf",
                 f"fps={fps},scale={width}:{height}:force_original_aspect_ratio=increase,crop={width}:{height}",
                 str(out / "c_%05d.png")],
                check=True,
                capture_output=True,
            )
            frames = sorted(out.glob("c_*.png"))
            # Same reasoning as the missing file above: a decode that yields
            # nothing drops the approved clip just as silently, and ffmpeg
            # exiting 0 on a truncated or unreadable file is exactly the case
            # that would otherwise slip through.
            if not frames:
                raise SystemExit(
                    f"approved clip for stage {clip['stageId']} at {src} decoded to no frames. "
                    "The file is unusable — replace it, or un-approve the clip, and compose again."
                )
            clip_frames[clip["stageId"]] = frames
            print(f"  using approved clip for stage {clip['stageId']} ({len(frames)} frames)")

    base_images: dict[str, Image.Image] = {}
    for entry in stills_index["stills"]:
        img = Image.open(entry["file"]).convert("RGB")
        if img.size != (width, height):
            img = img.resize((width, height), Image.LANCZOS)
        base_images[entry["stageId"]] = img

    missing = [s["id"] for s in stages if s["id"] not in base_images]
    if missing:
        print(f"Missing stage stills: {missing}", file=sys.stderr)
        return 1

    work = Path(args.work)
    work.mkdir(parents=True, exist_ok=True)
    for old in work.glob("f_*.png"):
        old.unlink()

    total = int(round(duration * fps))
    arrays = {k: np.asarray(v, dtype=np.uint8) for k, v in base_images.items()}

    # A clip animates FROM the previous stage's still INTO this stage's state,
    # so it is a transition, not the stage itself: it is scheduled to FINISH on
    # stage.start, playing across the tail of the interval before it. See
    # scripts/clip_schedule.py for the window rule and why each clip is fenced
    # into that one interval. Frame index -> (stage id, clip frame index).
    clip_lengths = {stage_id: len(frames) for stage_id, frames in clip_frames.items()}
    clip_windows = build_clip_windows(stages, fps, clip_lengths)
    clip_schedule = build_clip_schedule(stages, fps, clip_lengths)
    # Nothing in a clip request names the authored target render — the provider
    # gets the PREVIOUS stage's still and a differential prompt — so a clip can
    # settle its object slightly off the authored still and the cut to that
    # still on the very next frame pops. This dissolves the clip into its
    # target across the tail of its own window, reaching it exactly on the last
    # frame before the boundary. See build_clip_landing.
    clip_landing = build_clip_landing(stages, fps, clip_lengths)
    for stage_id in sorted(clip_frames):
        window = clip_windows.get(stage_id)
        if window is None:
            print(f"  clip for stage {stage_id} has no room before its boundary; NOT used", file=sys.stderr)
        elif window[1] - window[0] < clip_lengths[stage_id]:
            print(
                f"  clip for stage {stage_id} is {clip_lengths[stage_id]} frames for a "
                f"{window[1] - window[0]}-frame window; resampling the whole clip into it "
                f"(no frames discarded)"
            )

    # Each stage still already carries its own baked lighting state, so the
    # absolute envelope must not be applied on top of it or the arc is counted
    # twice. What the envelope contributes is the *within-stage* ramp, taken
    # relative to that stage's typical exposure.
    #
    # "Typical" is the median over the stage rather than the value at its
    # start: warm-reveal begins at 11.95 s, 50 ms before the lights actually
    # come up at 12.00 s, so normalising to the start treated the dark
    # pre-switch instant as the baseline and scaled the whole lit stage by
    # ~1.6x, blowing the worktop and wall to flat white.
    stage_norm: dict[str, float] = {}
    for s in stages:
        span = [e for (tt, e) in envelope if s["start"] <= tt <= s["end"]]
        span = span or [exposure_at(envelope, (s["start"] + s["end"]) / 2)]
        stage_norm[s["id"]] = float(np.median(span))

    # Adjacent gestures are fenced apart before any frame is drawn: two
    # boundaries closer together than the nominal 0.8s gesture span would
    # otherwise put two hands on screen at once (see gesture_timing).
    gesture_stages = [s for s in stages if s["gesture"] != "none" and s["gestureFrom"]]
    gesture_spans = dict(
        zip(
            (s["id"] for s in gesture_stages),
            gesture_windows([s["start"] for s in gesture_stages], HAND_LEAD_SEC, HAND_TRAIL_SEC),
        )
    )

    for f in range(total):
        t = f / fps
        stage = stage_at(stages, t)

        norm = stage_norm[stage["id"]]
        rel = exposure_at(envelope, t) / norm if norm > 0 else 1.0

        # An approved clip supplies the transition INTO a stage, scheduled to
        # finish exactly on that stage's boundary (see clip_schedule above);
        # every other frame comes from the stage still. Either way the same
        # exposure envelope and hand layer are applied on top, so edit timing
        # stays the compositor's to control.
        scheduled = clip_schedule.get(f)
        if scheduled is not None:
            clip_stage_id, clip_frame_index = scheduled
            frame = apply_exposure(
                np.asarray(
                    Image.open(clip_frames[clip_stage_id][clip_frame_index]).convert("RGB"),
                    dtype=np.uint8,
                ),
                rel,
            )
            # Land the clip on the authored still it is transitioning into, so
            # the cut to that still on the next frame is continuous however far
            # the provider's finished state drifted from ours. Weight is 0 for
            # everything but the window's tail and exactly 1.0 on its last
            # frame, so a faithful clip dissolves between two identical images.
            landing = clip_landing.get(f, 0.0)
            if landing > 0.0:
                # Each half is exposed with ITS OWN stage normalisation BEFORE
                # blending. `rel` above belongs to the stage currently playing;
                # the still being landed on belongs to the NEXT one, whose
                # envelope median can differ. Blending raw pixels and exposing
                # once afterwards would arrive at a target that is right in
                # content and wrong in brightness — trading a geometry pop for
                # an exposure one. This way the landing frame is exactly what
                # the frame after the boundary renders.
                target_norm = stage_norm[clip_stage_id]
                target_rel = exposure_at(envelope, t) / target_norm if target_norm > 0 else 1.0
                target = apply_exposure(arrays[clip_stage_id], target_rel)
                frame = np.clip(
                    frame.astype(np.float32) * (1.0 - landing) + target.astype(np.float32) * landing,
                    0,
                    255,
                ).astype(np.uint8)
        else:
            frame = apply_exposure(arrays[stage["id"]], rel)

        img = Image.fromarray(frame)

        # Hand layer: peak pinned to the stage boundary so the gesture and the
        # object's appearance land on the same frame.
        for s in gesture_stages:
            lead, trail = gesture_spans[s["id"]]
            g_start = s["start"] - lead
            g_end = s["start"] + trail
            if g_start <= t <= g_end:
                # Not a plain ramp across the window: the lead and trail are
                # deliberately unequal, so that would put the action instant
                # 50 ms before the boundary instead of on it. See
                # scripts/gesture_timing.py.
                progress = gesture_progress(t, s["start"], lead, trail)
                hand = render_gesture((width, height), s["gesture"], s["gestureFrom"], progress)
                if hand is not None:
                    img = Image.alpha_composite(img.convert("RGBA"), hand).convert("RGB")

        img.save(work / f"f_{f:05d}.png")
        if f % 60 == 0:
            print(f"  frame {f}/{total} t={t:.2f}s stage={stage['id']}")

    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)

    import imageio_ffmpeg

    ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
    mp4 = out_dir / "kitchen-transformation.mp4"
    webm = out_dir / "kitchen-transformation.webm"
    poster = out_dir / "kitchen-transformation-poster.jpg"

    common = [ffmpeg, "-y", "-framerate", str(fps), "-i", str(work / "f_%05d.png")]
    subprocess.run(
        common + [
            "-c:v", "libx264", "-profile:v", "high", "-pix_fmt", "yuv420p",
            "-crf", "20", "-preset", "slow",
            # Browsers need the moov atom up front or the clip will not start
            # playing until the whole file has downloaded.
            "-movflags", "+faststart",
            str(mp4),
        ],
        check=True,
        capture_output=True,
    )
    subprocess.run(
        common + ["-c:v", "libvpx-vp9", "-crf", "34", "-b:v", "0", "-pix_fmt", "yuv420p", str(webm)],
        check=True,
        capture_output=True,
    )
    # Poster is the finished warm-lit room, not frame 0: the bare shell is a
    # poor thumbnail for a piece whose whole point is the finished kitchen.
    subprocess.run(
        [ffmpeg, "-y", "-i", str(mp4), "-ss", f"{duration - 0.2:.2f}", "-frames:v", "1",
         "-q:v", "4", str(poster)],
        check=True,
        capture_output=True,
    )

    meta = {
        "generatedAt": stills_index.get("generatedAt"),
        "durationSec": duration,
        "fps": fps,
        "width": width,
        "height": height,
        "frames": total,
        "camera": manifest["camera"],
        "stages": [
            {"id": s["id"], "start": s["start"], "end": s["end"], "lighting": s["lighting"]}
            for s in stages
        ],
        "assets": {
            "mp4": f"/transformation/{mp4.name}",
            "webm": f"/transformation/{webm.name}",
            "poster": f"/transformation/{poster.name}",
        },
        # Only stages whose clip actually reached the master — a clip that was
        # listed and approved but scheduled out of the film must not be
        # credited here. The window makes the claim checkable: those exact
        # frames came from that clip.
        "stagesFromGeneratedClips": sorted(clip_windows.keys()),
        "generatedClipWindows": {
            stage_id: {
                "startFrame": start,
                "endFrame": end,
                "frames": end - start,
                # Tail of this window cross-dissolved into the stage's authored
                # still, so the clip lands on it exactly rather than cutting.
                "landingFrames": min(CLIP_LANDING_FRAMES, end - start),
            }
            for stage_id, (start, end) in sorted(clip_windows.items())
        },
        "provenance": (
            "Composed deterministically from locked-camera 3D renders of the real house model. "
            "Stages listed in stagesFromGeneratedClips used an approved Higgsfield clip for their motion, "
            "over the frame range given in generatedClipWindows, each cross-dissolved into that stage's "
            "authored still over its final landingFrames so the boundary is continuous whatever the "
            "provider returned; "
            "all edit timing, exposure and hand compositing remain compositor-controlled."
        ),
    }
    (out_dir / "manifest.json").write_text(json.dumps(meta, indent=2) + "\n")

    print(f"\nmaster : {mp4} ({mp4.stat().st_size / 1e6:.2f} MB)")
    print(f"webm   : {webm} ({webm.stat().st_size / 1e6:.2f} MB)")
    print(f"poster : {poster}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

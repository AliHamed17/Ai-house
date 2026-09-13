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
            src = Path(str(clip.get("file", "")).lstrip("/"))
            src = src if src.exists() else Path("public") / str(clip.get("file", "")).lstrip("/")
            if not src.exists():
                print(f"  clip for stage {clip.get('stageId')} listed but missing at {src}, skipping")
                continue
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
            if frames:
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

    for f in range(total):
        t = f / fps
        stage = stage_at(stages, t)

        norm = stage_norm[stage["id"]]
        rel = exposure_at(envelope, t) / norm if norm > 0 else 1.0

        # An approved clip supplies this stage's motion; the still is the
        # fallback. Either way the same exposure envelope and hand layer are
        # applied on top, so the edit timing stays the compositor's to control.
        stage_clip = clip_frames.get(stage["id"])
        if stage_clip:
            offset = int(round((t - stage["start"]) * fps))
            source = np.asarray(
                Image.open(stage_clip[min(offset, len(stage_clip) - 1)]).convert("RGB"),
                dtype=np.uint8,
            )
        else:
            source = arrays[stage["id"]]

        frame = apply_exposure(source, rel)
        img = Image.fromarray(frame)

        # Hand layer: peak pinned to the stage boundary so the gesture and the
        # object's appearance land on the same frame.
        for s in stages:
            if s["gesture"] == "none" or not s["gestureFrom"]:
                continue
            g_start = s["start"] - HAND_LEAD_SEC
            g_end = s["start"] + HAND_TRAIL_SEC
            if g_start <= t <= g_end:
                progress = (t - g_start) / (g_end - g_start)
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
        "stagesFromGeneratedClips": sorted(clip_frames.keys()),
        "provenance": (
            "Composed deterministically from locked-camera 3D renders of the real house model. "
            "Stages listed in stagesFromGeneratedClips used an approved Higgsfield clip for their motion; "
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

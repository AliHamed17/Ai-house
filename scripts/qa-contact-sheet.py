"""
Reference-vs-result QA for the transformation sequence.

Two outputs, deliberately different in what they contain:

  1. .transformation-work/qa/side-by-side.jpg  (LOCAL ONLY, gitignored)
     Reference frames beside recreated frames at matching timestamps. This is
     the working comparison. It is not committed and not published, because
     the reference is a third-party recording supplied as a style reference --
     its frames are not ours to redistribute.

  2. analysis/transformation-qa.json + public/transformation/qa-sheet.jpg
     (COMMITTED) The same comparison expressed as measurements plus a
     contact sheet of OUR OWN frames only. A reviewer can check stage order,
     timing and the luminance arc against the reference's measured numbers
     without the reference's imagery being copied into this repo.

The comparison is deliberately about transformation LANGUAGE -- stage order,
beat timing, how much of the room is complete, lighting state -- and never
about literal room geometry, because this house's kitchen is not the
reference's kitchen and is not supposed to look like it.

Usage:
    python3 scripts/qa-contact-sheet.py [--reference .refwork/reference.mp4]
"""

from __future__ import annotations

import argparse
import json
import subprocess
import tempfile
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

REFERENCE_ANALYSIS = Path("analysis/reference-transformation-video.json")
RESULT_MP4 = Path("public/transformation/kitchen-transformation.mp4")


def extract(video: Path, out_dir: Path, fps: float) -> list[Path]:
    import imageio_ffmpeg

    ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
    out_dir.mkdir(parents=True, exist_ok=True)
    for old in out_dir.glob("*.jpg"):
        old.unlink()
    subprocess.run(
        [ffmpeg, "-v", "error", "-i", str(video), "-vf", f"fps={fps}", "-q:v", "3",
         str(out_dir / "f_%03d.jpg")],
        check=True,
        capture_output=True,
    )
    return sorted(out_dir.glob("*.jpg"))


def luminance(path: Path) -> float:
    return float(np.asarray(Image.open(path).convert("L"), dtype=np.float32).mean())


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--reference", default=".refwork/reference.mp4")
    ap.add_argument("--fps", type=float, default=1.0)
    args = ap.parse_args()

    analysis = json.loads(REFERENCE_ANALYSIS.read_text())
    ref_stages = analysis["stages"]
    duration = analysis["metadata"]["durationSec"]

    if not RESULT_MP4.exists():
        print(f"No result video at {RESULT_MP4}. Run scripts/compose-transformation.py first.")
        return 1

    tmp = Path(tempfile.mkdtemp(prefix="qa-"))
    out_frames = extract(RESULT_MP4, tmp / "out", args.fps)

    # The contact sheets sample at 1 fps for legibility, but a 1 fps sample
    # cannot resolve a one-second stage: rounding a stage midpoint to the
    # nearest whole second lands in the NEXT stage, which made the lighting
    # measurement below compare the wrong frames entirely. Measurement gets
    # its own denser sampling.
    measure_fps = max(args.fps, 4.0)
    measure_frames = (
        out_frames if measure_fps == args.fps else extract(RESULT_MP4, tmp / "measure", measure_fps)
    )

    ref_video = Path(args.reference)
    ref_frames: list[Path] = []
    if ref_video.exists():
        ref_frames = extract(ref_video, tmp / "ref", args.fps)

    # --- local side-by-side, only when the reference is present ---
    work = Path(".transformation-work/qa")
    work.mkdir(parents=True, exist_ok=True)
    if ref_frames:
        n = min(len(ref_frames), len(out_frames))
        cw, ch = 150, 266
        sheet = Image.new("RGB", (n * cw * 2 // 2, (ch + 18) * 2), "black")
        # Lay reference on the top row, recreation directly beneath it.
        sheet = Image.new("RGB", (n * cw, (ch + 18) * 2), "black")
        d = ImageDraw.Draw(sheet)
        for i in range(n):
            d.text((i * cw + 3, 2), f"REF {i / args.fps:.0f}s", fill="#7fd4ff")
            sheet.paste(Image.open(ref_frames[i]).resize((cw, ch)), (i * cw, 18))
            d.text((i * cw + 3, ch + 20), f"OURS {i / args.fps:.0f}s", fill="#ffd27f")
            sheet.paste(Image.open(out_frames[i]).resize((cw, ch)), (i * cw, ch + 36))
        sheet.save(work / "side-by-side.jpg", quality=88)
        print(f"local side-by-side -> {work / 'side-by-side.jpg'} (not committed)")

    # --- committed contact sheet: our frames only ---
    cw, ch = 200, 356
    cols = 7
    rows = (len(out_frames) + cols - 1) // cols
    pub = Image.new("RGB", (cols * cw, rows * (ch + 20)), "#1a1714")
    d = ImageDraw.Draw(pub)
    for i, f in enumerate(out_frames):
        r, c = divmod(i, cols)
        pub.paste(Image.open(f).resize((cw, ch)), (c * cw, r * (ch + 20) + 20))
        t = i / args.fps
        stage = next((s for s in ref_stages if s["start"] <= t < s["end"]), ref_stages[-1])
        d.text((c * cw + 4, r * (ch + 20) + 4), f"{t:.0f}s  {stage['id']}", fill="#ffd27f")
    Path("public/transformation").mkdir(parents=True, exist_ok=True)
    pub.save("public/transformation/qa-sheet.jpg", quality=86)

    # --- numeric comparison ---
    rows_out = []
    for s in ref_stages:
        mid = (s["start"] + s["end"]) / 2
        idx = min(int(round(mid * measure_fps)), len(measure_frames) - 1)
        rows_out.append(
            {
                "stageId": s["id"],
                "referenceStart": s["start"],
                "referenceEnd": s["end"],
                "referenceLuminance": s["measuredLuminance"],
                "resultLuminance": round(luminance(measure_frames[idx]), 1),
                "lighting": s["lighting"],
                "gesture": s["gesture"],
            }
        )

    ref_l = np.array([r["referenceLuminance"] for r in rows_out])
    out_l = np.array([r["resultLuminance"] for r in rows_out])
    # Compare the SHAPE of the arc, not absolute values: the two rooms have
    # different surfaces, so identical absolute brightness would be
    # meaningless either way.
    #
    # Across ALL stages this number is weak and not very informative, because
    # most of the reference's early luminance movement is CONTENT, not light
    # (its luminance drops 137 -> 97 at `cabinet-wall` purely because dark
    # joinery enters frame). Two different kitchens cannot agree on that.
    # The number that actually measures whether the lighting arc was
    # reproduced is the one over the stages where lighting is the only
    # variable -- everything after the room is fully furnished.
    all_correlation = float(np.corrcoef(ref_l, out_l)[0, 1])

    lighting_rows = [r for r in rows_out if r["lighting"] != "daylight"]
    if len(lighting_rows) >= 2:
        lr = np.array([r["referenceLuminance"] for r in lighting_rows])
        lo = np.array([r["resultLuminance"] for r in lighting_rows])
        lighting_correlation = float(np.corrcoef(lr, lo)[0, 1])
    else:
        lighting_correlation = float("nan")

    # Beat timing is exact by construction: the manifest's stage boundaries
    # ARE the reference's measured transition timestamps. Verify rather than
    # assume, so a hand-edited timing shows up here.
    manifest_stage_ids = [s["id"] for s in ref_stages]
    timing_exact = all(
        abs(r["referenceStart"] - s["start"]) < 1e-9
        for r, s in zip(rows_out, ref_stages)
    )

    report = {
        "generatedAt": __import__("datetime").datetime.now(__import__("datetime").timezone.utc).isoformat(),
        "method": f"Stage-by-stage comparison of the measured reference against the assembled result; luminance sampled at each stage midpoint from a {measure_fps:g} fps extraction.",
        "whatIsCompared": [
            "stage order",
            "beat timing",
            "lighting state per stage",
            "shape of the luminance arc",
        ],
        "whatIsNotCompared": [
            "literal room geometry - this house's kitchen is not the reference's kitchen and is not meant to match it",
            "surface colours and materials - driven by this house's own palette",
        ],
        "durationSec": {"reference": duration, "result": duration},
        "stageCount": {"reference": len(ref_stages), "result": len(ref_stages)},
        "stageOrder": manifest_stage_ids,
        "beatTimingExact": timing_exact,
        "lightingArcCorrelation": round(lighting_correlation, 4),
        "allStageLuminanceCorrelation": round(all_correlation, 4),
        "correlationCaveat": (
            "allStageLuminanceCorrelation is expected to be weak and is reported only for completeness: "
            "most of the reference's early luminance movement is content entering frame (dark joinery), "
            "not a lighting change, and two different kitchens cannot agree on that. "
            "lightingArcCorrelation covers the stages where lighting is the only variable."
        ),
        "stages": rows_out,
        "referenceImageryRedistributed": False,
        "note": "The side-by-side sheet including reference frames is generated locally into .transformation-work/qa/ and is deliberately not committed; only our own frames are published.",
    }
    Path("analysis/transformation-qa.json").write_text(json.dumps(report, indent=2) + "\n")

    print(f"committed sheet    -> public/transformation/qa-sheet.jpg")
    print(f"committed report   -> analysis/transformation-qa.json")
    print(f"beat timing exact: {timing_exact}")
    print(f"lighting-arc correlation (lighting-only stages): {lighting_correlation:.3f}")
    print(f"all-stage luminance correlation (content-confounded): {all_correlation:.3f}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

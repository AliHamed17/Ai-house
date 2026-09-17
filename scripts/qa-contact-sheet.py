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
import sys
import tempfile
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

sys.path.insert(0, str(Path(__file__).resolve().parent))

from qa_report import (  # noqa: E402
    MIN_LIGHTING_ARC_CORRELATION,
    json_number,
    lighting_arc_problems,
)

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
    # Loaded up here because BOTH the per-stage rows and the timing audit
    # below read it: the rows report the produced lighting, and the audit
    # compares it. (The audit's own reason for using it is that comparing
    # ref_stages to itself made beatTimingExact necessarily true.)
    produced_path = Path("public/transformation/manifest.json")
    produced = json.loads(produced_path.read_text()) if produced_path.exists() else None

    # What the compositor actually wrote, keyed by stage, so each row can
    # report the produced lighting rather than echoing the reference's.
    produced_lighting = {
        p["id"]: p.get("lighting") for p in (produced or {}).get("stages", [])
    }

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
                "referenceLighting": s["lighting"],
                "resultLighting": produced_lighting.get(s["id"]),
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

    lighting_rows = [r for r in rows_out if r["referenceLighting"] != "daylight"]
    if len(lighting_rows) >= 2:
        lr = np.array([r["referenceLuminance"] for r in lighting_rows])
        lo = np.array([r["resultLuminance"] for r in lighting_rows])
        # nan whenever either series is constant — a flat, black or frozen
        # render is exactly that, and lighting_arc_problems below treats it as
        # the failure it is rather than letting it pass as "no problem found".
        lighting_correlation = float(np.corrcoef(lr, lo)[0, 1])
    else:
        lighting_correlation = float("nan")

    lighting_problems = lighting_arc_problems(lighting_correlation, len(lighting_rows))

    # Beat timing must be checked against the manifest the COMPOSITOR actually
    # wrote, not against ref_stages. Comparing ref_stages to itself (which is
    # what this did before) made beatTimingExact necessarily true and would
    # have published any real compositor or output-manifest timing regression
    # as a passing audit.

    timing_problems: list[str] = []
    if produced is None:
        timing_problems.append(
            "No produced manifest at public/transformation/manifest.json — cannot verify the result's timing."
        )
        produced_stage_ids: list[str] = []
    else:
        produced_stages = produced.get("stages", [])
        produced_stage_ids = [p["id"] for p in produced_stages]
        ref_ids = [r["id"] for r in ref_stages]
        if produced_stage_ids != ref_ids:
            timing_problems.append(
                f"Produced stage order {produced_stage_ids} does not match the reference order {ref_ids}."
            )
        else:
            for ref, got in zip(ref_stages, produced_stages):
                if abs(float(got["start"]) - float(ref["start"])) > 1e-6:
                    timing_problems.append(
                        f"Stage {ref['id']}: produced start {got['start']} != reference {ref['start']}."
                    )
                if abs(float(got["end"]) - float(ref["end"])) > 1e-6:
                    timing_problems.append(
                        f"Stage {ref['id']}: produced end {got['end']} != reference {ref['end']}."
                    )
                # whatIsCompared claims lighting state per stage, so it has to
                # actually be compared. Without this the compositor could
                # change a stage's lighting while keeping its id and timings
                # and the audit would report no problem at all, while rows_out
                # went on publishing the REFERENCE value as if it were the
                # produced one.
                if got.get("lighting") != ref.get("lighting"):
                    timing_problems.append(
                        f"Stage {ref['id']}: produced lighting {got.get('lighting')!r} "
                        f"!= reference {ref.get('lighting')!r}."
                    )
        if abs(float(produced.get("durationSec", -1)) - duration) > 1e-6:
            timing_problems.append(
                f"Produced duration {produced.get('durationSec')} != reference duration {duration}."
            )

    timing_exact = not timing_problems

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
        "durationSec": {
            "reference": duration,
            "result": (produced or {}).get("durationSec"),
        },
        "stageCount": {"reference": len(ref_stages), "result": len(produced_stage_ids)},
        "stageOrder": produced_stage_ids,
        "beatTimingExact": timing_exact,
        "beatTimingProblems": timing_problems,
        "timingVerifiedAgainst": str(produced_path),
        # json_number, not round(): a flat or fully black render makes
        # np.corrcoef return nan, and json.dumps writes that as a bare `NaN`
        # token, which is not valid JSON — the report would be unreadable by
        # every strict parser, including whoever is trying to find out why the
        # run failed. null says "no measurement" in a form that parses.
        "lightingArcCorrelation": json_number(lighting_correlation),
        "allStageLuminanceCorrelation": json_number(all_correlation),
        "minLightingArcCorrelation": MIN_LIGHTING_ARC_CORRELATION,
        "lightingArcAcceptable": not lighting_problems,
        "lightingArcProblems": lighting_problems,
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
    print(f"beat timing exact (vs produced manifest): {timing_exact}")
    for problem in timing_problems:
        print(f"  timing problem: {problem}")
    print(f"lighting-arc correlation (lighting-only stages): {lighting_correlation:.3f}")
    for problem in lighting_problems:
        print(f"  lighting problem: {problem}")
    print(f"all-stage luminance correlation (content-confounded): {all_correlation:.3f}")
    # A failed audit has to fail the COMMAND, not just be written into the
    # report. Recording the problem and still exiting 0 meant
    # `npm run transformation:qa` stayed green while publishing a mismatched
    # video, so any regeneration workflow would sail straight past it — which
    # is precisely the case the structural checks above exist to catch. The
    # report and sheet are written first, so a failing run still leaves the
    # evidence behind for whoever reads it.
    #
    # The lighting arc counts here too (regression): checking only
    # timing_problems meant a regeneration that kept the manifest intact — so
    # every structural check still passed — but rendered the arc backwards,
    # flat or fully black exited 0 all the same, and whatIsCompared goes on
    # claiming "shape of the luminance arc" is part of this audit.
    return 1 if timing_problems or lighting_problems else 0


if __name__ == "__main__":
    raise SystemExit(main())

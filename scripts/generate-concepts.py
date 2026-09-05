#!/usr/bin/env python3
"""
Generate REAL Nano Banana (Gemini) interior concept renders for the house and
drop them where the site will pick them up automatically.

This follows the Nano Banana skill's documented pattern (google-genai + uv,
model gemini-3-pro-image-preview). Each render uses the room's unfinished
evidence frame as a hard architectural + camera reference (image-to-image
edit), with the exact same prompt language the running app uses in
src/data/roomPrompts.ts — so an offline batch here and an on-demand render in
the AI Studio produce consistent results.

Outputs:
  public/generated/concepts/<room>.png            one render per room
  public/generated/concepts/manifest.json         { "generatedRooms": [...] }

The site (src/data/generatedConcepts.ts) reads that manifest and prefers a
real <room>.png over the labeled placeholder <room>.svg wherever a render
exists — so the before/after gallery upgrades to real Nano Banana output the
moment this script has run, and gracefully shows placeholders until then.

Requires a key: set GEMINI_API_KEY or GOOGLE_API_KEY. This spends real Gemini
image credits, so it never runs automatically — you invoke it explicitly.

Usage:
  # default: the four before/after showcase rooms
  uv run scripts/generate-concepts.py
  # specific rooms:
  uv run scripts/generate-concepts.py living kitchen parents_bed
  # every room the AI Studio exposes:
  uv run scripts/generate-concepts.py --all

Without uv:
  pip install google-genai pillow && python scripts/generate-concepts.py
"""
# /// script
# dependencies = ["google-genai", "pillow"]
# ///
import json
import os
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
FRAMES_DIR = REPO_ROOT / "public" / "evidence" / "frames"
OUT_DIR = REPO_ROOT / "public" / "generated" / "concepts"
MANIFEST = OUT_DIR / "manifest.json"
MODEL = os.environ.get("NANO_BANANA_MODEL", "gemini-3-pro-image-preview")

# The before/after gallery in src/components/landing/BeforeConceptSection.tsx.
FEATURED_ROOMS = ["living", "kitchen", "parents_bed", "bathroom_main"]

# Mirror of the per-room furniture plans in src/data/roomPrompts.ts.
FURNITURE = {
    "stair_landing": "slip-resistant pale stone stair treads, a slim dark-bronze handrail, and integrated warm step lighting",
    "entry_hall": "a shallow natural-oak console, a full-height mirror, and concealed shoe storage without blocking circulation",
    "living": "a low curved warm-beige modular sofa, two sculptural lounge chairs, a textured wool rug, nested stone/oak coffee tables, and one calm textured-plaster media wall with concealed storage",
    "kitchen": "full-height oak and taupe cabinetry on the solid wall, integrated appliances, a light quartzite-look worktop and backsplash, and discreet under-cabinet task lighting, preserving the drawn L-shaped counter layout",
    "dining": "a 6-seat oak or stone-top oval table, upholstered dining chairs, and one centered sculptural warm pendant light",
    "terrace_social": "compact weather-resistant outdoor seating, restrained planters, and one warm wall light under the covered recess",
    "mamad": "a sofa bed or bed, a compact desk, and closed storage that leaves the protected door, window, and required clearances completely unobstructed",
    "twin_bed": "two equivalent single beds, balanced closed storage, and a long shared study surface, keeping the central floor area open",
    "bathroom_main": "continuous warm stone-look porcelain, a floating oak/taupe vanity, a recessed niche, frameless glass, and face lighting at the mirror",
    "bathroom_ensuite": "a compact floating vanity, frameless glass shower screen, and warm face lighting at the mirror",
    "wc_guest": "a compact sculptural basin, a richer restrained stone texture, and one warm wall light",
    "parents_bed": "a broad upholstered headboard wall, oak bedside tables, integrated wardrobes, and layered linen curtains",
}

# Mirror of roomEvidenceFrame in src/data/evidenceFrames.ts (frame used as the
# architectural + camera reference for each room).
FRAME = {
    "stair_landing": "00-00-03_exterior-stair-landing.jpg",
    "entry_hall": "00-00-09_entry-threshold.jpg",
    "living": "00-00-16_open-social-zone.jpg",
    "kitchen": "00-00-16_open-social-zone.jpg",
    "dining": "00-00-16_open-social-zone.jpg",
    "terrace_social": "00-00-22_covered-terrace.jpg",
    "mamad": "00-00-40_bedroom-or-mamad.jpg",
    "twin_bed": "00-00-44_second-bedroom.jpg",
    "bathroom_main": "00-00-29_hall-wetroom.jpg",
    "bathroom_ensuite": "00-00-49_second-shower.jpg",
    "wc_guest": "00-00-29_hall-wetroom.jpg",
    "parents_bed": "00-00-54_third-bedroom-mamad.jpg",
}

PALETTE_SENTENCE = (
    "Apply the approved house-wide palette of warm ivory, natural oak, pale "
    "limestone, taupe textiles, dark bronze details, and 2700-3000K layered lighting."
)
NEGATIVE = (
    "No people, no labels, no watermark-like text, no warped furniture, no "
    "impossible reflections, no added or removed doors or windows, no resized "
    "or relocated openings."
)
VARIANT = (
    "Warm Oak & Limestone — The house-wide default: pale limestone social "
    "floors, matte oak bedrooms, dark-bronze metal accents."
)


def build_prompt(room_id: str) -> str:
    plan = FURNITURE.get(room_id, "a tasteful warm-modern-luxury furniture plan appropriate to the room")
    return " ".join([
        "Using the supplied unfinished-room frame as a hard architectural and camera reference, complete this exact room as a photorealistic warm-modern-luxury interior.",
        "Preserve the camera position, lens perspective, wall geometry, ceiling height impression, every visible door opening, every window opening, structural columns, and the exterior view.",
        "Do not add, remove, resize, or relocate any opening.",
        f"Apply this room-specific furniture plan: {plan}.",
        PALETTE_SENTENCE,
        f"Material direction for this variation: {VARIANT}",
        "Make the result buildable, uncluttered, and correctly scaled. Keep plumbing fixtures only in their plan-supported wet zone.",
        f"Return a clean high-resolution architectural visualization. {NEGATIVE}",
    ])


def load_manifest() -> set[str]:
    if MANIFEST.exists():
        try:
            return set(json.loads(MANIFEST.read_text()).get("generatedRooms", []))
        except (ValueError, OSError):
            return set()
    return set()


def save_manifest(rooms: set[str]) -> None:
    ordered = [r for r in FRAME if r in rooms]  # stable, house order
    MANIFEST.write_text(json.dumps({"generatedRooms": ordered}, indent=2) + "\n")


def main() -> int:
    args = [a for a in sys.argv[1:] if a]
    if "--all" in args:
        rooms = [r for r in FRAME]
    elif args:
        rooms = args
    else:
        rooms = FEATURED_ROOMS

    unknown = [r for r in rooms if r not in FRAME]
    if unknown:
        print(f"Unknown room id(s): {', '.join(unknown)}\nKnown: {', '.join(FRAME)}", file=sys.stderr)
        return 2

    if not (os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")):
        print(
            "No Gemini credentials found. Set GEMINI_API_KEY or GOOGLE_API_KEY and re-run:\n"
            "  GEMINI_API_KEY=your_key uv run scripts/generate-concepts.py\n"
            "Get a key at https://aistudio.google.com/apikey . This spends real image credits.",
            file=sys.stderr,
        )
        return 2

    # Imported here so --help / the no-key path work without the SDK installed.
    from google import genai
    from google.genai import types
    from PIL import Image

    client = genai.Client()
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    done = load_manifest()

    for room_id in rooms:
        frame_path = FRAMES_DIR / FRAME[room_id]
        if not frame_path.exists():
            print(f"[skip] {room_id}: missing evidence frame {frame_path}", file=sys.stderr)
            continue
        print(f"[gen ] {room_id} <- {frame_path.name} ({MODEL}) ...")
        try:
            response = client.models.generate_content(
                model=MODEL,
                contents=[build_prompt(room_id), Image.open(frame_path)],
                config=types.GenerateContentConfig(
                    response_modalities=["IMAGE"],
                    image_config=types.ImageConfig(aspect_ratio="4:3", image_size="2K"),
                ),
            )
        except Exception as exc:  # noqa: BLE001 - surface any provider/auth error plainly
            print(f"[fail] {room_id}: {exc}", file=sys.stderr)
            continue

        saved = False
        for part in response.parts:
            if getattr(part, "inline_data", None) is not None:
                out = OUT_DIR / f"{room_id}.png"
                part.as_image().save(out)
                print(f"[ok  ] saved {out.relative_to(REPO_ROOT)}")
                done.add(room_id)
                saved = True
                break
            elif getattr(part, "text", None):
                print(f"[note] {room_id}: {part.text}")
        if not saved:
            print(f"[fail] {room_id}: model returned no image", file=sys.stderr)

    save_manifest(done)
    print(f"\nManifest now lists {len(done)} real render(s): {', '.join(sorted(done)) or '(none)'}")
    print("The site will serve <room>.png for those rooms and placeholders for the rest.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

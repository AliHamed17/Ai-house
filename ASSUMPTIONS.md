# Assumptions and open questions

This project is built from one photographed floor-plan drawing and one
61-second handheld walkthrough video of an unfinished house — not a
construction survey. Every item below is an assumption, an inference, or a
value carried forward with lower confidence than the rest of the model.
Update the referenced field in `src/data/house.ts` once verified measurements
are available; nothing else needs to change, since the 3D model, floor plan,
minimap, and AI prompts are all derived from that one file.

See `analysis/house-evidence.json` for the full machine-readable version of
this list (with per-item confidence levels and source notes), and
`Ali_House_Evidence_Interior_Design_Brief.md` for the original interpretation
this project was built from.

## Most urgent to confirm

1. **Ceiling height (`CEILING_HEIGHT_M` in `src/data/house.ts`, currently
   2.70 m).** Not reliably shown in either source. Every room's wall height,
   door/window proportions, and camera framing depend on this single
   constant — confirming it first has the highest leverage.
2. **Overall building envelope.** The plan's uncertain long dimension
   strings (~9.04 m / 11.70 m / 15.00 m) were not confidently traced to
   specific endpoints. The modeled house is roughly 15.2 m × 15.4 m
   (bounding box across all rooms in `src/data/house.ts`); the 15.00 m
   string is the closest loose match but was not verified.
3. **Entry hall and private-corridor footprints** (`entry_hall`,
   `hall_south` in `src/data/house.ts`). These circulation spaces were sized
   from adjacency and typical clearances, not from a legible plan dimension.
4. **Guest WC and parents' en-suite dimensions** (`wc_guest`,
   `bathroom_ensuite`). Approximate, adjacency-based; the plan crop supplied
   did not show legible dimensions for these two rooms.
5. **Bathroom door relationships.** Whether the parents' bedroom has a direct
   en-suite connection (vs. hall-only access to `bathroom_ensuite`) is not
   confirmed. The model currently connects `bathroom_ensuite` to
   `hall_south` only.

## Everything else carried as an assumption

- **Wall thickness** (`WALL_THICKNESS_M`, 0.20 m) — matches the plan's
  repeated "20" (cm) markings at wall segments, but was not independently
  verified.
- **Living-room facade chamfer** (`LIVING_CHAMFER_M`, ~1.30 m) — stands in
  for the plan's drawn curved/angled exterior corner. The true curve radius
  is not legible on the perspective-distorted photograph.
- **Terrace/loggia dimensions** (`terrace_social`) — inferred only from the
  walkthrough video (00:20–00:25), not dimensioned on the legible plan area.
- **Balcony/service area use** (`balcony_service`) — leisure vs.
  laundry/service use is unconfirmed; kept configurable per the brief.
- **Door swing directions and hinge sides** — not modeled; only opening
  position and width are represented (`src/data/house.ts:openings`).
- **Red/blue wall-segment plan markings** — no legend was supplied, so no
  structural (load-bearing vs. partition) distinction is encoded anywhere.
- **Wet-room ventilation** (`wc_guest`, `bathroom_ensuite`) — modeled with no
  window (assumed mechanical extraction); unconfirmed.
- **Structural column position** (`structuralFeatures` in
  `src/data/house.ts`) — placed to match its approximate position in the
  walkthrough (00:12–00:20), not measured.

## Non-negotiable constraint (not an assumption)

The `mamad` room is an Israeli protected room. Its door, window,
ventilation, and required clearances are fixed in the data model
(`isProtected: true` on the room and on its one door/window in
`src/data/house.ts`) and are validated by
`tests/unit/house-validation.test.ts`. No material variant, lighting mode,
or AI-generated concept in this project alters them — material variants only
ever change floor/wall colors (`src/data/materials.ts`), never geometry.

## Remaining limitation

Nothing in this project should be treated as construction-accurate. A
licensed architect/engineer must verify every dimension, structural element,
and code requirement (waterproofing, electrical, plumbing, ventilation,
structural work) against the original CAD/PDF plan and an on-site survey
before any of it informs real construction. See the "Technical note" section
on the landing page for the same disclosure shown to end users.

# Assumptions and open questions

This project is built from one photographed floor-plan drawing and one
61-second handheld walkthrough video of an unfinished house — not a
construction survey. Every item below is an assumption, an inference, or a
value carried forward with lower confidence than the rest of the model.
Update the referenced field in `src/data/house.ts` once verified measurements
are available; nothing else needs to change, since the 3D model, floor plan,
minimap, and AI prompts are all derived from that one file.

See `analysis/house-evidence.json` for the full machine-readable version of
this list, including the 14 corrections applied when the model was rebuilt.

## What the model is

A **15.00 m × 8.72 m east-west bar**, aspect 1.72:1, plus a north terrace and
stair strip and a south terrace. Both of the architect's dimension chains
close exactly on those figures:

- across the top: `760 + 740 = 1500`
- down the centre: `30 + 300 + 20 + 100 + 20 + 137 + 10 + 235 + 20 = 872`

Coordinates are metres, `+x` east, `+z` south, origin at the west outer wall
face by the north outer face of the east block. Room polygons meet at
interior wall **centrelines** and exterior wall **outer faces**, so each
polygon is larger than its printed clear dimension by 0.05 m per partition and
0.20 m per exterior wall. `dimensions` on each room carries the printed clear
value; `dimensionSource` says where it came from.

## Reading the plan photograph

The sheet is a photo of paper and is **globally bowed** — long straight lines
curve, including the dimension chains themselves. Curvature is camera
distortion, not drawn geometry. The previous model encoded a 1.30 m chamfered
"curved facade corner" (`LIVING_CHAMFER_M`) that was purely this artefact; the
living room's north-west corner is square. When a line looks bent, check
whether every other line on the sheet bends with it.

The architect's own drawing carries roughly 5% internal inconsistency in the
west half: the mid horizontal chain sums 1506 against a printed 1500, and
`232 + 517` sums 749 against a printed 760. The model absorbs that slack in
the entry hall rather than forcing closure.

## Most urgent to confirm

1. **Ceiling height** (`CEILING_HEIGHT_M`, currently 2.70 m). Not reliably
   shown in either source. Every wall height, door/window proportion, and
   camera framing depends on this one constant — highest leverage to confirm.
   The floor is marked `+6.20 / 18.52` while site levels around it read
   12.03–12.19 m, and the video never shows an interior stair or a second
   storey, so the storey context is unresolved.
2. **South terrace depth** (`terrace_south`). The weakest room in the model.
   Never entered in the walkthrough; readers split between the printed 270,
   a nearby 300, and a ~55 cm French-balcony reading. Confirmed as a walkable
   terrace by the owner and modelled at 2.70 m, but not measured.
3. **Guest WC width** (`wc`). The one compartment the architect never
   dimensioned — the lower chain reads `232 | 10 | blank | 10 | 170 | 10 | 150`.
   ~100 cm clear is a scaled measurement against the adjacent printed values,
   not a transcription.
4. **Corridor length** (`corridor`, 3.07 m east-west). Not dimensioned. It is
   derived from two dimensioned ends rather than measured, so it inherits the
   accumulated chain error.
5. **East facade step** (`bedroom_parents`). 0.68 m by chain arithmetic but
   0.84 m by naive pixel differencing. The chain value is kept because it
   closes; a site measurement would settle it.

## Everything else carried as an assumption

- **Which bedroom is which.** `bedroom_parents` is the room filmed at
  t=43–46.8 s solely because the camera walks from it straight into the
  en-suite, and the en-suite has exactly one door. Both rooms are corner rooms
  with windows on adjacent walls, and every east window is blown out in the
  video, so the imagery alone does not disambiguate them.
- **Wall thickness** (`WALL_THICKNESS_M`, 0.20 m) — matches the plan's
  repeated "20" (cm) markings, but was not independently verified. Interior
  partitions in the wet block are drawn at 10 cm.
- **MAMAD recess width** (`mamad_recess`, 1.00 m clear) — the depth is the
  printed 100 on the central chain; the width is inferred from the drawn
  extent of the reinforced stub.
- **Structural columns** — eleven piers, each traced to a discrete blue blob
  on the plan and cross-checked against the walkthrough. The plan draws them
  as rectangular piers and blades; the video reads several as rounded
  rendered columns. The radii (0.18–0.22 m) are a rendering choice, not a
  measurement. One round column with a spalled chip visible at t=55.4 s has no
  counterpart anywhere on the plan.
- **Dining bay depth** (`dining`, 2.82 m) — inferred from a drawn ~40 cm
  facade step at the kitchen/dining line, not printed. The brief's claim that
  dining shares the kitchen's 322 depth was checked and is wrong.
- **Wet-room ventilation** — small high windows are modelled on the south
  wall of each wet room from the walkthrough; the guest WC window is the least
  supported of the three.
- **Door swing directions and hinge sides** — not modelled; only opening
  position and width are represented (`src/data/house.ts:openings`).
- **True north** — unconfirmed. There is no unambiguous north arrow on the
  sheet; the hatched circle at top right may be a rainwater gully rather than
  a compass. All compass language in this project means up/down on the
  drawing.

## Non-negotiable constraint (not an assumption)

The `mamad` room is an Israeli protected room. Its door, window, ventilation,
and required clearances are fixed in the data model (`isProtected: true` on
the room and on its one door and one window in `src/data/house.ts`) and are
validated by `tests/unit/house-validation.test.ts` and
`tests/unit/house-geometry-invariants.test.ts`.

It has **exactly one door, in its south wall**, opening into a reinforced
recess (`mamad_recess`) that gives the outward-swinging blast door a clear
arc. It has **no opening onto the entry hall** — an earlier model placed the
door in the west wall, which is drawn as unbroken reinforced concrete. No
material variant, lighting mode, or AI-generated concept alters any of this;
material variants only ever change floor/wall colours
(`src/data/materials.ts`), never geometry.

## Remaining limitation

Nothing in this project should be treated as construction-accurate. A
licensed architect/engineer must verify every dimension, structural element,
and code requirement (waterproofing, electrical, plumbing, ventilation,
structural work) against the original CAD/PDF plan and an on-site survey
before any of it informs real construction. See the "Technical note" section
on the landing page for the same disclosure shown to end users.

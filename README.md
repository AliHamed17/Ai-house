# Ali's House — Interactive Warm-Modern-Luxury 3D Concept

A single-page, real-time interactive concept for an unfinished house: a
premium landing page, a genuinely navigable 3D model built from the actual
floor plan (not a video loop), and an AI Design Studio that generates
photorealistic room concepts (Nano Banana / Gemini) and cinematic clips
(Higgsfield) — with a fully functional demo mode when no API keys are
configured.

> **This is a concept visualization, not construction documentation.** See
> [`ASSUMPTIONS.md`](./ASSUMPTIONS.md) and
> [`analysis/house-evidence.json`](./analysis/house-evidence.json) for every
> uncertain dimension and the exact field to correct once a verified
> CAD/PDF plan or site survey is available.

## What's here

- **Landing page** — hero, evidence (original plan + walkthrough frames),
  an interactive floor plan, room-by-room design stories, a materials
  board, before/concept comparison sliders, and the AI Design Studio.
- **3D explorer** (`Enter 3D`) — first-person walking with mouse/touch look
  and WASD/joystick movement, wall collision, an orbit/"dollhouse" mode, a
  floor-plan mode, a live minimap, door hotspots, a room navigator, day/
  evening lighting, and three swappable material variants. Falls back to a
  2D room-card view if WebGL is unavailable.
- **Saved pieces** — click any piece of furniture and `Save` to shortlist it.
  `♥ Saved` lists everything you've kept, grouped by room, each row still
  carrying its real retailer link, with a one-click plain-text export for
  whoever is doing the ordering. The list lives in your browser only.
- **Shareable views** — `Share view` copies a link that reopens the explorer
  in exactly the room, mode, lighting, and materials you were looking at
  (`/?room=kitchen&mode=orbit&light=evening&look=cool-stone`), so a specific
  view can be sent or bookmarked instead of described.
- **AI Design Studio** — generate a photorealistic room concept (Nano
  Banana) or animate an approved still into a cinematic clip (Higgsfield),
  with real submit → poll-status job flow and demo-mode success/failure/
  moderated simulation.
- **Server-side API routes** — `/api/nano-banana/generate`,
  `/api/higgsfield/generate`, `/api/generation/status/[id]`. Credentials are
  read from environment variables on the server only and never appear in
  client code, logs, or error text.

## Tech stack

Next.js 16 (App Router, Turbopack) · React 19 · TypeScript · Tailwind CSS 4 ·
Three.js via `@react-three/fiber` + `@react-three/drei` · Zustand ·
`@google/genai` · `@higgsfield/client` · Vitest · Playwright.

## Quick start

```bash
npm install
npm run dev
```

Open <http://localhost:3000>. No environment variables are required — the AI
Design Studio automatically runs in demo mode.

## Publishing it

There is no public URL for this project yet; it runs locally or in CI. The
fastest way to get one is `.github/workflows/deploy.yml`, which builds and
deploys to Vercel from GitHub Actions — so the credentials stay in the
repository's own secrets rather than on anyone's laptop.

Set it up once:

```bash
npx vercel link          # creates the project; writes .vercel/project.json
```

Then add three repository secrets (**Settings → Secrets and variables →
Actions**), taking the last two straight from `.vercel/project.json`:

| Secret | Value |
| --- | --- |
| `VERCEL_TOKEN` | a token from <https://vercel.com/account/settings/tokens> |
| `VERCEL_ORG_ID` | `orgId` |
| `VERCEL_PROJECT_ID` | `projectId` |

Then give the **Vercel project** — not this repository — a stable
`JOB_ID_SIGNING_SECRET`, under **Settings → Environment Variables**, for every
environment you deploy to. Any long random string works
(`openssl rand -hex 32`). This one is not optional on Vercel: the platform runs
the app as concurrent serverless instances, and without a shared secret each
signs job ids with its own random per-process key, so a status poll landing on
a different instance than the submit rejects a legitimate id — which breaks the
AI Studio **even in demo mode** (see "Known prototype limitations"). The deploy
workflow checks for it after `vercel pull` and refuses to publish without it,
rather than shipping a site whose Studio is quietly broken.

Run it from **Actions → Deploy → Run workflow** (choose `preview` for a
throwaway URL or `production` for the project domain); the URL appears in the
job summary. Note that a `workflow_dispatch` workflow is only registered once
it exists on the repository's **default branch**, so the Deploy entry does not
appear in the Actions tab until this branch is merged — until then, use the
manual route below. Pushes to `main` deploy a preview automatically. Until the
three repository secrets exist the workflow skips instead of failing, so a fork
never sees a red X for a deployment it was never going to do.

The deployment is given **no AI credentials on purpose**: with none set the app
serves its full demo mode, so the published site is completely usable and
cannot spend money. That is a claim about the Vercel project's own environment,
so the workflow checks it rather than assuming it — if the environment it is
about to deploy sets `AI_ALLOW_LIVE=true` or any provider credential, it stops
and names the variables (never their values) instead of publishing something it
would go on to describe as unable to spend money. Enabling real generation is a
separate decision — see `AI_ALLOW_LIVE` below, and read its warning about
putting authentication and quotas in front of the public, unauthenticated
`/api/*/generate` routes first.

Deploying by hand instead works the same way, and needs no repository secrets:
`npx vercel deploy` from a machine logged into a Vercel account. The same
`JOB_ID_SIGNING_SECRET` caveat applies — set it on the project first, or the
published Studio will fail its first status poll.

## Commands

```bash
npm run dev          # start the dev server (Turbopack)
npm run build         # production build
npm run start         # serve the production build
npm run lint          # ESLint
npx tsc --noEmit       # type-check
npm run test           # Vitest unit tests
npm run test:compositor # Python unit tests for the video compositor's clip scheduling
npm run test:e2e       # Playwright end-to-end tests (builds + starts the app first)
```

`test:compositor` needs only `python3` — it covers
[`scripts/clip_schedule.py`](./scripts/clip_schedule.py), which is kept free
of numpy/pillow precisely so this can run anywhere.

If your environment doesn't have Chromium pre-installed for Playwright, run
`npx playwright install chromium` once first. If it's pre-installed at a
non-default path, point Playwright at it instead of downloading:
`PLAYWRIGHT_CHROMIUM_EXECUTABLE=/path/to/chromium npm run test:e2e`.

## Environment variables

All optional — copy [`\.env.example`](./.env.example) to `.env.local` and
fill in only what you have:

| Variable | Purpose |
| --- | --- |
| `AI_ALLOW_LIVE` | Master switch — must be exactly `true` for any billed generation to run. With a key set but this unset, the app stays in demo mode, so a key used only for the offline generator or local dev never exposes a public billed endpoint. **A public deployment that enables this must add real authentication/quotas in front of the `/api/*/generate` routes** — the client-side cost confirmation is not a server-side control. |
| `JOB_ID_SIGNING_SECRET` | **Required for any live (billed) generation.** A stable, deployment-wide secret used to sign every job id. Without it, each process start signs with its own random secret, so a status check landing on a different serverless instance (or after a restart) would reject an otherwise-genuine job id, permanently losing the only encoded request id for a paid result. Both live generation routes refuse to start until this is set; any long random string works (e.g. `openssl rand -hex 32`). |
| `GEMINI_API_KEY` / `GOOGLE_API_KEY` | Enables real Nano Banana (Gemini) image generation (either is accepted). |
| `NANO_BANANA_MODEL` | Overrides the model (default `gemini-3-pro-image-preview`, i.e. Nano Banana Pro). |
| `HF_CREDENTIALS` | Higgsfield credentials as `KEY_ID:KEY_SECRET`. |
| `HF_API_KEY` / `HF_API_SECRET` | Alternative to `HF_CREDENTIALS`. |
| `HF_IMAGE2VIDEO_ENDPOINT` / `HF_MODEL` | Override the Higgsfield endpoint/model. |
| `PUBLIC_ASSET_ORIGIN` | **Required for live Higgsfield generation.** This deployment's real public origin, used to build the source image URL Higgsfield fetches from its own servers. Deliberately not derived from the incoming request — a spoofed Host header could otherwise redirect that fetch (and billed credits) to a server an attacker controls. |

### Generating the real interior concepts (Nano Banana)

The before/after gallery ships with clearly-labeled placeholders and upgrades
to real Nano Banana (Gemini) renders as soon as you generate them:

```bash
# Renders the four showcase rooms (living, kitchen, parents' bedroom, main bath)
GEMINI_API_KEY=your_key uv run scripts/generate-concepts.py
# …or every room the AI Studio exposes:
GEMINI_API_KEY=your_key uv run scripts/generate-concepts.py --all
```

Each render uses the room's unfinished walkthrough frame as a hard
architectural/camera reference and the exact prompt language in
`src/data/roomPrompts.ts`. Outputs land in `public/generated/concepts/<room>.png`
and are recorded in `public/generated/concepts/manifest.json`; the site
(`src/data/generatedConcepts.ts`) then serves the real PNG for those rooms and
the placeholder SVG for the rest — no code change needed. This spends real
Gemini image credits, so it never runs automatically. The `.claude/skills/nano-banana/`
skill documents the underlying Gemini image API.

### What works without any keys

Everything. The landing page, the full 3D explorer (walking, collision,
orbit/dollhouse, floor-plan mode, minimap, lighting, material variants), and
the AI Design Studio all work with zero configuration. Missing credentials
transparently switch the studio into a labeled **Demo mode**, which returns
deterministic placeholder concept images and lets you manually exercise the
queued/in-progress/completed/failed/moderated states via a "simulate
outcome" control. No component can crash from an absent key — see
`src/lib/ai/registry.server.ts`.

## Project structure

```text
analysis/house-evidence.json   Evidence discipline: sources, rooms, openings, timeline, assumptions
src/data/house.ts               Typed room/wall/opening data — the single source of truth for the model
src/data/materials.ts           Palette, material variants, lighting presets
src/data/roomPrompts.ts         Nano Banana / Higgsfield prompt templates
src/lib/geometry/               Wall-panel sweep algorithm, collision, point-in-polygon
src/lib/validation/             House-model structural validation (used by tests)
src/lib/shortlist.ts            Saved-pieces list: storage validation, grouping, plain-text export
src/lib/viewerLink.ts           Shareable explorer views: query-string encode/parse, URL building
src/lib/ai/                     Provider abstraction, Nano Banana + Higgsfield adapters, mock provider
src/components/viewer3d/        The 3D explorer (scene, controls, hotspots, minimap, mobile controls)
src/components/floorplan/       Shared interactive floor-plan SVG (landing page + in-explorer floor-plan mode)
src/components/landing/         Landing page sections
src/components/ai-studio/       AI Design Studio UI
src/app/api/                    Nano Banana / Higgsfield / generation-status route handlers
tests/unit/                     Vitest — data integrity, geometry, collision, AI providers
tests/e2e/                      Playwright — landing, floor plan, explorer, AI studio, responsive, mobile
scripts/generate-placeholders.mjs  Regenerates the deterministic demo-mode placeholder images (all rooms)
scripts/generate-concepts.py    Generates REAL Nano Banana concept renders (needs a Gemini key)
scripts/smoke.mjs               Manual visual smoke script (screenshots every major flow)
.claude/skills/nano-banana/     Nano Banana (Gemini image) skill used by scripts/generate-concepts.py
```

## Kitchen transformation sequence

A reference-matched, 13.37 s vertical film in which the kitchen builds itself
under a locked camera — and which shares one design state with the walkable 3D
room, so you can step out of the film and into the same moment in 3D.

**The whole point is that nothing generative touches the geometry.** Every
frame is rendered from the same house model the explorer walks through, from a
camera whose position, target and FOV are constants, so the architecture
cannot drift, morph or breathe between stages. Objects only ever accumulate.

- `analysis/reference-transformation-video.json` — frame-level forensic
  analysis of the supplied reference (measured, not estimated: stage
  boundaries, gesture windows, a 0 px camera-drift measurement, and the
  luminance arc). Reference imagery is **not** redistributed; only numbers
  survive into the pipeline.
- `src/data/kitchenTransformation.ts` — **the manifest, and the single source
  of truth.** Stage timings here are the reference's measured transition
  timestamps. It drives the stills, the clip prompts, the compositor, the
  player and the 3D room's stage state. There is no second copy of the timing.
- `src/data/furniture.ts` — the finished kitchen, dimensioned against this
  kitchen's real geometry, each piece tagged with the stage it appears at.
  The video and the 3D room read the same list, so they cannot disagree.
- `src/lib/transformation.ts` — the pure mapping layer:
  `getTransformationStageAtTime(t)`, `visibleFurnitureAtStage(id)`,
  `isFurnitureVisibleAtStage(item, id)`, `exposureAtTime(t)`.

### Regenerating it

```bash
pip install pillow numpy imageio-ffmpeg      # one-time, for the compositor
npm run build && npm run start &             # the renderer reads the live app

npm run transformation:stills                # 12 locked-camera stage stills
npm run transformation:compose               # assemble the master MP4/WebM/poster
npm run transformation:qa                    # reference-vs-result QA report
```

Outputs land in `public/transformation/` (master `.mp4`, `.webm`, poster,
published stage stills, `manifest.json`) and `analysis/transformation-qa.json`.

### Where Higgsfield fits

Higgsfield is wired for **motion between two already-approved stills** and
nothing else — it is never asked to invent geometry, choose a camera, decide
what furniture exists, or control edit timing. A model that cannot change the
room cannot make the room drift.

- `src/lib/ai/transformationClips.server.ts` — the clip plan and the
  differential, preservation-first prompts (each names only what its stage
  adds, then spends its budget forbidding change).
- `scripts/clip_schedule.py` — where each clip is allowed to play. A clip is
  the transition *into* its stage, so it finishes exactly on that boundary and
  is fenced into the interval immediately before it. That fence is what makes
  the windows disjoint: without it a longer clip reached back over its
  predecessor's frames and silently replaced an earlier paid generation. The
  plan quotes that span as `windowSec` — deliberately not a "duration", since
  the DoP image-to-video endpoint takes no duration parameter and returns a
  clip at the model's own length. A longer result is **resampled** across its
  window rather than truncated, so the whole placement motion survives and no
  billed second is discarded; a clip that already fits is used frame for
  frame.
- `POST /api/transformation/clip` — submits one clip. It inherits every guard
  the other generate routes use (rate limit, the `AI_ALLOW_LIVE` master
  switch, cost confirmation, signed job ids, idempotent reservation), and
  **derives the source image path itself from the stage id** rather than
  accepting one from the caller, so it cannot be used to point Higgsfield's
  credentialed fetch at an arbitrary URL.
- `GET /api/transformation/clip` — describes the plan without submitting
  anything. Nothing bills on page load; generation needs an explicit POST.

**Without Higgsfield credentials the sequence is unaffected** — the committed
master video is assembled entirely from the deterministic 3D renders, and
clips are an optional enhancement layer on top.

### The hand layer

`scripts/hand_layer.py` draws the gesture hands procedurally rather than
generating them. Hands are exactly where video models fail worst (six fingers,
melting wrists, a hand that occludes the geometry that must stay stable), and a
deterministic hand that is merely stylised beats a photoreal one that is
sometimes malformed. Every hand is built from one anatomically-proportioned rig
— palm, four fingers at real relative lengths, an opposed thumb — so it can be
posed but cannot come out wrong. Gesture semantics (pinch = discrete object,
sweep = continuous surface) mirror the grammar measured off the reference, and
each gesture peaks on exactly the frame its object appears.

## Manual visual QA checklist

Automated tests cover data integrity, geometry, and interaction flows: run
`npm run test` (Vitest), `npm run test:compositor` (Python) and
`npm run test:e2e` (Playwright) — all must pass.
Additionally, spot-check by eye at least once per change to the 3D geometry
or camera code:

- [ ] Every room's walls, floor, and ceiling align with no gaps or overlaps.
- [ ] Doorway openings line up with the floor-plan's door markers.
- [ ] Camera eye height and field of view feel natural standing in each room.
- [ ] MAMAD's window and door are present, unobstructed, and unaffected by
      every material variant and lighting mode.
- [ ] Furniture-proxy or structural-column placement doesn't clip through
      walls.
- [ ] Before/concept comparison sliders stay aligned at both ends of the drag.
- [ ] Desktop drag-to-look, WASD, and the mobile joystick/touch-look all
      feel correct at a phone-sized viewport.
- [ ] Switching mode (Walk / Dollhouse / Floor Plan) never leaves the HUD
      unreachable.

## Known prototype limitations

- **Every server-side store in `src/lib/ai/` (`rateLimit.server.ts`,
  `jobId.ts`, `resultStore.server.ts`, `idempotency.server.ts`) is
  per-process, in-memory, and does not survive a cold start or coordinate
  across instances** — a deliberate, documented tradeoff appropriate for a
  single long-running process or local dev, but genuinely broken on a
  multi-instance/serverless deployment (e.g. concurrent Vercel functions)
  where a submit, a status poll, and a result download for the SAME job can
  each land on a different instance:
  - `jobId.ts` — with no `JOB_ID_SIGNING_SECRET` configured, each instance
    signs with its own random per-process secret, so even a **demo** job's
    status poll can 404 with "invalid job id" on a different instance. Live
    generation already refuses to start without this secret configured
    (see `hasStableJobIdSigningSecret`); a multi-instance deployment serving
    demo mode should set it too, even though it isn't required to.
  - `resultStore.server.ts` — a generated (and, in live mode, already
    billed) image's bytes live only on the instance that created them; a
    status/result request landing elsewhere sees a false "expired" 404, and
    a follow-up refinement or Higgsfield clip can lose its source image.
  - `idempotency.server.ts` — a retry after a lost response is only
    recognized as a duplicate by the SAME instance that made the original
    reservation; on a different instance it finds no reservation and can
    start a second, separately billed generation despite reusing the exact
    idempotency key.
  - `rateLimit.server.ts` — limits are tracked per instance, so real
    throughput across a fleet can exceed the configured ceiling.

  A production deployment intending real (`AI_ALLOW_LIVE=true`) traffic on
  more than one instance needs a shared, atomic store (e.g. Redis/a
  database) behind these four modules — this repo does not include one.
- Real Nano Banana / Higgsfield calls have not been exercised against live
  credentials in this environment (none were configured); the adapters
  follow the providers' documented request/response shapes but should be
  smoke-tested against a real account before production use.
- See [`ASSUMPTIONS.md`](./ASSUMPTIONS.md) for every geometric assumption
  that needs confirming against a real CAD/PDF plan or site survey.

## Privacy

Evidence assets (the floor plan photo, walkthrough video, and extracted
frames) are served from `public/evidence/`. Keep this project private until
you've confirmed you're comfortable with those images and the house's
general layout being publicly visible — no address or map coordinates are
included anywhere in the project.

Your saved-pieces list never leaves the browser: it is a list of furniture
ids in `localStorage` under `ai-house:shortlist:v1`, read only by the page
itself, with no account, sync, or server call behind it. Clearing the list
(or the site's data) is the whole of deleting it. A shared view link carries
only what the explorer was showing — a room, a mode, a lighting setting, a
material variant — and never the saved list.

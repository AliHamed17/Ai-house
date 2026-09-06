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

## Commands

```bash
npm run dev          # start the dev server (Turbopack)
npm run build         # production build
npm run start         # serve the production build
npm run lint          # ESLint
npx tsc --noEmit       # type-check
npm run test           # Vitest unit tests
npm run test:e2e       # Playwright end-to-end tests (builds + starts the app first)
```

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

## Manual visual QA checklist

Automated tests cover data integrity, geometry, and interaction flows: run
`npm run test` (Vitest) and `npm run test:e2e` (Playwright) — both must pass.
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

- The in-memory rate limiter and the opaque job-id-encodes-everything status
  flow are appropriate for a prototype but not for a multi-instance
  production deployment — see the comments in `src/lib/ai/rateLimit.server.ts`
  and `src/lib/ai/jobId.ts` for what a production version should use instead
  (a shared rate-limit store; durable blob storage for generated media
  instead of inline data URLs).
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

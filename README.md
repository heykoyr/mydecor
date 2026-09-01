# MyDecor

**See what fits.**

Photograph a room and see what could work in it — real products, placed in your own space, before you buy.

> `MyDecor` is a working name. It is defined once in [`src/config/brand.ts`](src/config/brand.ts) and read from there everywhere it appears. Renaming the product is a change to that file plus asset filenames.

---

## The product

The core loop, and the only thing that matters until it feels effortless:

```
photo  →  understand the space  →  hotspots  →  products  →  preview in the room
```

A user takes or uploads a photo. The app works out what the space is and where its
decoration opportunities are, drops lightweight hotspots onto the image, recommends
products that suit each spot, and composites the chosen product back into the
user's own photograph.

## Stack

| Concern | Choice | Why |
| --- | --- | --- |
| Framework | Next.js 15 (App Router), React 19 | Server routes keep provider keys off the client; RSC keeps the shell light on mobile |
| Language | TypeScript, `strict` + `noUncheckedIndexedAccess` | Geometry and catalogue code is where silent `undefined` bugs hide |
| Styling | Tailwind CSS 3.4 over CSS custom properties | One token layer drives light/dark and any future re-theme |
| Motion | Framer Motion | Sheet, hotspot and preview transitions; respects `prefers-reduced-motion` |
| State | Zustand | Small, synchronous stores; no provider tree |
| Persistence | IndexedDB (local-first) behind a repository interface | See [Persistence](#persistence) |

No UI component library. The design system is the product's own.

## Architecture

```
src/
  app/          routes, layouts, API route handlers
  components/   ui/ (design system) · room/ · product/ · nav/
  lib/
    vision/     image signal extraction, providers, opportunity engine
    products/   catalogue repository, recommendation engine
    visualize/  in-room compositing
    data/       local persistence
    analytics/  event instrumentation
  types/        the domain model
  config/       brand and runtime configuration
```

Three boundaries are deliberate and load-bearing:

**1. Providers are replaceable.** Room understanding, product supply and
visualisation each sit behind an interface with more than one implementation,
selected at runtime from environment configuration. No vendor's SDK types leak
past its own adapter.

**2. Perception is separate from product reasoning.** A vision provider's only
job is to say what is in the photo and where. Turning that into *decoration
opportunities* is deterministic application logic. The consequence: swapping
vision models never changes what the product recommends, and the opportunity
rules are testable without a model in the loop.

**3. Model prose never drives control flow.** Every field the UI branches on is
a literal union in [`src/types/domain.ts`](src/types/domain.ts). Free-form model
text is confined to fields that are only ever displayed.

Geometry is normalised (0–1) against the source image everywhere, never pixels,
so one analysis drives a thumbnail and a 12-megapixel original identically.

## Setup

Requires Node 20.19+.

```bash
npm install
```

```bash
npm run dev
```

The app runs with no configuration at all — see below for what that costs.

### Environment variables

Copy `.env.example` to `.env.local`. Every key is read server-side only; none is
prefixed `NEXT_PUBLIC_`.

| Variable | Default | Effect |
| --- | --- | --- |
| `VISION_PROVIDER` | `auto` | `auto` uses a model when a key is present, otherwise the built-in analyser |
| `ANTHROPIC_API_KEY` | — | Enables model-based room understanding |
| `VISUALIZATION_PROVIDER` | `auto` | `composite` uses the built-in compositor; `inpaint` calls an external image model |
| `INPAINT_API_URL` / `INPAINT_API_KEY` | — | Endpoint for generative in-room previews |
| `CATALOG_PROVIDER` | `static` | `http` swaps the bundled catalogue for a live product feed |
| `NEXT_PUBLIC_APP_URL` | `http://localhost:3000` | Canonical origin for metadata and share links |

## Current status

This section tracks what is actually implemented. It is updated per phase, not
aspirationally.

- [x] **Phase 0** — repository, brand configuration, design tokens, domain model
- [x] **Phase 1** — application shell, routing, foundational components
- [x] **Phase 2** — capture and upload
- [x] **Phase 3** — room analysis and hotspots
- [x] **Phase 4** — catalogue and recommendations
- [x] **Phase 5** — in-room preview
- [ ] **Phase 6** — saved products, preferences
- [ ] **Phase 7** — discovery, desktop composition, polish pass

The core loop runs end to end today: photograph a room, get hotspots on real
surfaces, open one, browse ranked products, and see a chosen product composited
into your own photo with perspective, scale, colour grading and a contact
shadow.

## How room understanding works

Three stages, in order, with a clean seam between each.

**1. Signals** (`src/lib/vision/signals.ts`) — runs in the browser on every
scan, before any model. Downsamples the photo and measures palette, exposure,
focus, the strongest horizontal discontinuity in the lower frame (the floor
line), connected bright regions (windows) and per-column edge density above the
horizon (blank wall). Photo-quality problems are caught here, while the user is
still standing in the room.

**2. Perception** — a `VisionProvider` says what is in the photo and where.
Two implementations:

- `RemoteVisionProvider` → `/api/analyze` → Anthropic, using a tool definition
  for structured output. Every field is re-validated server-side against the
  domain unions before it reaches the app.
- `HeuristicVisionProvider` — geometry only, from the signals above. It finds
  walls, windows, floors and corners, and deliberately does not guess at
  furniture, which is not geometrically inferable. It marks itself
  `isHeuristic` and the UI says "surfaces only" rather than implying the room
  was recognised.

Selection is automatic, and degrades: if a model is configured but unreachable,
the on-device analyser still produces a usable room.

**3. Opportunities** (`src/lib/vision/opportunities.ts`) — deterministic rules,
not a model call. Each object type maps to candidate opportunities with a
placement mode, product categories, a rationale and a priority; rules suppress
themselves when the surface is already decorated (curtains on the window, a rug
on the floor). Candidates are then de-duplicated spatially and capped, because a
photo covered in dots is a heat map of the catalogue, not an insight.

## How the in-room preview works

`CanvasCompositeProvider` places the product's artwork into the photograph:

- **Perspective** — the opportunity's surface quad is filled by slicing the
  artwork into 48 vertical strips, each drawn under its own affine transform.
  Canvas 2D has no projective transform; at display resolution this is
  indistinguishable from one.
- **Scale** — surface-filling and wall-mounted items are sized against the
  region's width; anything standing on a floor or resting on furniture is sized
  against its *height*, because height against the surface behind it is what
  communicates real size.
- **Seating** — standing objects are anchored to the bottom edge of their
  region, so a lamp meets the floor rather than hovering.
- **Light** — the room's own colour and brightness are sampled under the
  placement, and the artwork is graded to match before it is drawn.
- **Shadow** — a soft contact ellipse follows the base's width.

Results are labelled *indicative*. The app has no measurement of the room and
says so wherever a preview is shown.

## Data model

Defined in [`src/types/domain.ts`](src/types/domain.ts).

```
Room ──1:1── RoomAnalysis ──*── DetectedObject
                    │
                    └────*──── Opportunity ──*── Recommendation ──1── Product ──*:1── Retailer
                                    │
Room ───────────────*───────── Visualization ──1── Product

SavedProduct ──1── Product        UserPreferences        AnalyticsEvent
```

- **Rooms** own their photograph and their analysis. Deleting a room deletes its
  visualisations with it.
- **Opportunities** reference a `DetectedObject` by id and carry the surface a
  product will be placed into, so a saved room replays identically without
  re-running analysis.
- **Products** belong to a `Retailer` and carry placement metadata
  (`supportedPlacements`, `coverage`) alongside commerce metadata, so the
  catalogue can come from several retailers without the visualiser knowing.
- **SavedProduct** records where it was saved from, which is what makes "seen in
  your bedroom" possible later.

## Commerce

```
Retailer → catalogue → recommendation → product detail → preview → outbound click
```

The app does not process payments. `buildOutboundUrl` attaches affiliate
attribution when a retailer has a programme, and `shop_clicked` is instrumented,
so the commercial layer is ready for a live catalogue. Until one is connected,
product detail says plainly that items are not purchasable rather than offering
a link that goes nowhere.

## Design system

Tokens live in [`globals.css`](src/app/globals.css) and are exposed through
[`tailwind.config.ts`](tailwind.config.ts), which *replaces* the default palette,
spacing and type scale rather than extending them.

- **Type** — nine named steps (`display`, `h1`–`h3`, `body-lg`, `body`,
  `body-sm`, `caption`, `label`), each with a fixed weight, line height and
  letter spacing. Components reference names, never raw sizes. An editorial
  serif carries display and headings; a system sans carries UI.
- **Colour** — warm neutral surfaces so photography is the only true colour in
  the interface, one clay accent, and semantic success/warning/danger. Light is
  canonical; dark redefines only what must change.
- **Spacing** — a 4px ramp. Layout stays on the whole steps; the half-steps
  exist for control sizing.
- **Radius** — five steps. **Elevation** — three shadows, all meaning depth.
- **Components** — buttons, icon buttons, chips, badges, cards, image frames,
  segmented controls, skeletons, empty/error states, narrated progress, toasts,
  one adaptive sheet, hotspots, the room canvas, product cards and product
  detail.

## Known limitations

Kept honest and current.

- **No production catalogue.** The bundled catalogue is structurally realistic
  but the items are not purchasable and the retailers are not real ones. Product
  detail says so on every item.
- **Product imagery is generated**, not retailer photography — parametric SVG
  tuned to composite convincingly. It is good enough to judge scale, colour and
  placement; it is not a photograph of the thing you would receive.
- **Without a vision key, room understanding is geometric only.** It finds
  walls, windows, floors and corners from the image itself but does not identify
  furniture, so opportunities anchored to sofas, beds, tables, desks and TVs
  never fire. The UI labels this "surfaces only" rather than implying otherwise.
- **Previews are indicative, not measured.** The app has no dimensions for the
  room, so a product is placed at plausible scale rather than true scale, and
  every preview says so.
- **No occlusion.** A composited product draws over everything in its region; it
  will not go behind an object already standing there.
- **Local-first, single device.** Rooms live in the browser that scanned them.
  There is no account, so they do not follow the user to another device, and a
  cleared browser store loses them.
- **No preferences UI.** The recommendation engine reads budget and preferred
  styles, and the repository persists them, but nothing sets them yet, so
  ranking runs on defaults.
- **Rate limiting is per-instance.** `/api/analyze` holds its counter in memory;
  more than one instance needs a shared store.
- **The repository lives inside a OneDrive-synced folder.** `next build` fails
  with `EPERM` on `.next/trace` while `next dev` is running, because both write
  the same directory and OneDrive holds handles open. Stop the dev server before
  building, or move the repository outside OneDrive.

## Recommended next steps

In order of product impact.

1. **Connect a vision model.** Everything downstream already works; furniture
   detection is the single change that turns "surfaces only" into a full read of
   the room, and it needs one environment variable.
2. **Connect a real catalogue.** Implement `ProductRepository` against a
   retailer feed and set `CATALOG_IS_REFERENCE` false. Product cards, ranking,
   detail and preview need no changes.
3. **A generative visualisation provider.** Implement `VisualizationProvider`
   with masked inpainting for the cases the compositor handles least well —
   soft goods that should drape over existing furniture.
4. **Tests around the pure layers.** The opportunity engine, recommendation
   scoring and quad geometry are deterministic functions and are where a
   regression would be least visible.
5. **Accounts and sync**, so rooms outlive one browser — the point at which the
   local repositories are swapped for server-backed ones.
6. **Preferences UI** for budget and style, feeding the ranking that already
   expects them.

## Licence

Private and unpublished.

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
- [ ] **Phase 1** — application shell, routing, foundational components
- [ ] **Phase 2** — capture and upload
- [ ] **Phase 3** — room analysis and hotspots
- [ ] **Phase 4** — catalogue and recommendations
- [ ] **Phase 5** — in-room preview
- [ ] **Phase 6** — persistence
- [ ] **Phase 7** — product polish pass

## Known limitations

Kept honest and current.

- No production product catalogue is connected. The bundled catalogue is
  structurally realistic but the items are not purchasable.
- Without a vision key, room understanding is geometric only: it finds surfaces
  (walls, windows, floors, corners) from the image itself but does not identify
  furniture. The UI states this rather than implying otherwise.
- In-room previews are indicative, not dimensionally accurate. The app has no
  measurement of the room and says so wherever a preview is shown.

## Licence

Private and unpublished.

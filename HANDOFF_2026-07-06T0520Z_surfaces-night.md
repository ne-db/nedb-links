# HANDOFF — 2026-07-06 ~05:20Z · Surfaces Night: PRs #30–#33

**State: main is everything — `a4c9f72`.** Four features, four green
merges, CI (`typecheck · test · live-api · build`) verified on every
head before every merge. Test counts at close: **59/59 unit · 48/48
live** vs real nedbd 2.6.1.

## What shipped tonight

| PR | What |
|----|------|
| #30 | **Background studio** — visual Background section: 5 preset gradient cards (Midnight/Sunset/Aurora/Lavender/Forest, the Oracle's exact stops), Custom builder (direction + 2–4 stops), Solid mode + swatches, Image "soon". Hover = try-on in the live phone (120ms fuse), click = apply. `manifest.background` is chrome OVER any theme: canvas swaps, cards/accents stay. Stored materialized (`{kind,direction,stops[]}`) so presets can be renamed forever. Page ink by WCAG contrast, split page-vs-card (`pageText`/`pageSub`). Hex-only stops + enum direction — one zod schema for PUT and preview. |
| #31 | **Drag-to-reorder blocks** — grip handle per card, pointer events + capture (HTML5 DnD never fires on touch), `touch-action:none` scoped to the grip so the page still scrolls. Pure math in `dragReorder.ts` (`moveItem` — arrows share it, `dragTarget` — midpoint crossing over variable heights, `siblingShift`). rAF-throttled, edge auto-scroll for phones, commit-on-release through the same `setBlocks`. Arrows kept. |
| #32 | **Social logos in the icon tray** — Brands row in the IconPicker: the same 13 SVGs the public header renders, stored as `soc:<brand>` tokens, resolved by the renderer through the same `brandGlyph()` (aliases honored: `soc:twitter` → X). Unknown tokens render NOTHING on public pages. Zero schema change. |
| #33 | **Markdown surface + Save & share block** — `GET /:handle.md` (and `?format=md`): YAML front matter, bio/socials/blocks in reading order, formats section teaching the whole URL grammar. Sixth registry citizen. Machine-honesty: DIRECT urls (no `/go/`), no analytics inflation, no token leaks, hostile text neutralized. Plus the `surfaces` block (chips: vCard/QR/card default-on, md/JSON opt-in) and `<link rel="alternate">` md/json/vcard in every page head. `.md` suffix survives handle renames. |

## Session lore (new)

- The wire teaches humility: I padded a printed short-sha into a fake
  full sha polling CI — 422. Pull the head sha from the PR object;
  never reconstruct hashes.
- `isFilledUrl` rejects URLs with spaces on EVERY surface — a "failing"
  markdown test was a wrong fixture, not wrong code. Debug by rendering
  and looking, not by guessing.
- Deriving push scripts with regex breaks on `[id]` in route paths
  (char-class `[^\]]` stops early). Write scripts fresh; stop doing
  template surgery.
- YAML front matter is quoted DATA — markdown escaping applies to the
  body. Consumers parse YAML there, not markdown.

## Where the storefronts stand

- One repo, N `.env`s: interchained.org (wallet+mach) · ne-db.com
  (email+v3) · **ourlynx.com** (Marisa's flagship: email mode,
  OurLynx brand). To pick up tonight's four features on a deployment:
  `git pull && pnpm run build`, restart `pnpm start`.
- Untracked `pnpm-lock.yaml` sits in the dev workspace; repo tracks
  `package-lock.json`. Decide one lockfile story before adding it —
  two lockfiles = drift.

## Queued next (priority order)

1. **Auth rate limiting** — extend the in-memory throttle (magic +
   uploads have it) to login/signup/challenge/forgot. THE
   pre-public-traffic item.
2. **Memories redraft** — thread drafts predate PRs #12–#33; recapture
   repo state, email-mode architecture, three storefronts, surfaces.
3. **og-image renderer** — seventh registry citizen; the markdown PR
   proves how cheap surfaces are now.
4. Roadmap: lifecycle PR (rename+redirect/unpublish/archive), AS OF
   history panel, AI Profile Assistant.
5. Engine parity queue (nedb repo ideas.md): nedb-v2 GROUP BY execution.

— Vex · main @ a4c9f72 · four-for-four

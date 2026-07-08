# HANDOFF — 2026-07-07 ~23:05Z · OurLynx Goes Live: PRs #35–#44

**State: main is everything — `dd8ae9c`.** Ten PRs, ten green merges,
CI (`typecheck · test · live-api · build`) verified on every head
before every merge. Live-shipped and confirmed on ourlynx.com the same
night. Two production incidents, both caught by Mark in real time,
both root-caused and fixed within minutes — that loop is the real
story of tonight.

## What shipped

| PR | What |
|----|------|
| #35 | **Mobile viewport fix** — nav looked ~89% width on phones. Root cause bisected with a headless-Chromium DOM bisector (hide subtrees, watch scrollWidth): two unshrinkable elements (a nowrap summary URL, a bare `1fr` grid track) stretched the mobile layout viewport to 522px. Fixed at the roots + `overflow-x: clip` seatbelt on html/body. |
| #36 | **The Discovery channel** — `/discover`, a zero-JS public directory. Opt-IN only (`manifest.discoverable`; publishing ≠ consent), safe projection (owner/principal never leave the server), cards tagged `?src=discover` so the existing analytics GROUP BY gains it as a traffic source for free. |
| #37 | **Page type editable** — `identityType` was baked at claim with no way to change it; Discover's chips made that load-bearing. Added the PUT path + a Profile-panel select. |
| #38 | **Giveaways** — Marisa's idea. Provably fair free-entry giveaways as premium lead generation. Commit-reveal (`sha256(secret)` published before entries open) → verified entries (name/phone/email, 6-digit code) → draw seed mixing the secret, an ITC beacon, and a ticket merkle root → `/r/:id/verify` re-runs the whole draw live. Holographic dopamine kit (conic rings, scarcity bar, ticket shine) — pure CSS, zero JS, reduced-motion safe. |
| #39 | **Brand knobs + the font vault** — `LINKS_BRAND_LOGO_URL`/`FAVICON_URL`/`HOLO_COLORS` (deployment identity as env, not a new theme — Mark's call). FONTS 10→38 across six registers (incl. Orbitron, the brand font); exactly 3 free, 35 premium, grandfathered. Playtest fix same PR: giveaway cap floor 2→1 (flash drops are legit). |
| #40 | **fix: email mode never speaks Electrum** — prod logs showed `Unknown character b` decoding `eml_…` as bech32. Holder-status checks are wallet-mode-only now; both call sites guard on `authMode === "wallet"`. |
| #41 | **The /assets → /brand rescue** (two incidents, one PR) — see Lessons below. |
| #42 | Demo placeholder handle → `mintontheavenue`. |
| #43 | **The EPIC upgrade modal** — Mark: "I have to look everywhere to upgrade — that kills the business side." One holographic modal, two summons: a persistent ✨ Premium chip in the nav, and `ApiError` now carries the server's machine code so every `premium_required` wall (giveaway/Discover/font) auto-opens the modal with a reason-tailored pitch. Hero now wears the brand mark. |
| #44 | **fix: portal the modal** — see Lessons below. |

## Two live incidents, root-caused fast

**Incident 1 — white screen (`/assets` collision).** My PR #41 mounted
deployment brand files at `/assets`. Vite *also* owns `/assets` for its
own SPA bundles (`dist/assets/index-*.js`). My mount + a terminal 404
handler blackholed the app's own JavaScript the moment it deployed —
total white screen. Mark's exact words located it instantly: "assets
isn't mounted yet, it's being considered a handle in the system."
Fixed by moving the mount to `/brand` (reserved handle, zero
collision), then **re-verified completely** — not just curling the
PNGs (what I'd done the first time), but loading the actual SPA shell
and fetching its real bundle URLs to prove nothing else could shadow
them. Lesson banked below.

**Incident 2 — the upgrade modal rendered pinned near the top with
stray scrollbars.** Mark's diagnosis, again exactly right on the first
try: "make it a react portal and its good." Root cause: `<nav>` carries
`backdrop-blur`, and per spec `filter`/`backdrop-filter` on an ancestor
establishes a new CSS containing block for `position: fixed`
descendants. The modal — rendered as Nav's child — was "fixed" to the
~56px nav strip, not the viewport. `createPortal(modal, document.body)`
made it immune permanently, regardless of what any future ancestor's
CSS does. Also rode along: the standard tall-content-modal pattern
(outer div scrolls, inner flex just grows — avoids the classic
"flex-center clips the top when content overflows" trap) and a themed
scrollbar (`.modal-scroll`) so it's an accent rail, not OS-gray chrome.

## The brand kit is live

Mark's OurLynx pack (lynx head built from the link glyph — the eyes
ARE chain links) is sliced and shipped:
- `public/lynx-mark.png`, `public/lynx-favicon.png` ship IN the repo
- `.env`: `LINKS_BRAND_LOGO_URL=/brand/lynx-mark.png`,
  `LINKS_FAVICON_URL=/brand/lynx-favicon.png`,
  `LINKS_HOLO_COLORS=#00C2FF,#3A7DFF,#7A5CFF,#B26CFF`
- The lynx now appears: Nav, Footer, every "published with" chip, the
  home hero (with a soft glow), the browser favicon tab, AND the
  giveaway holographic ring streams the brand ramp instead of the
  default rainbow — everywhere it spins.
- `assetUrl()` gate: root-relative paths pass, protocol-relative
  (`//host`) and scheme URLs (`javascript:`) are refused — an env typo
  can never inject a foreign origin into a public page.

## Session lore (paid for in production tonight)

- **Reserved ≠ served.** An unclaimable handle is not a mount. Two
  separate near-misses tonight both trace to this: "assets" being
  reserved said nothing about whether `/assets` actually served files,
  and once it did, nobody had checked what ELSE lived at that path.
- **Namespace collisions with your own build tool are invisible until
  deploy.** Vite's `assetsDir` default IS `/assets`. Any server-side
  mount at a path your bundler also owns is a live white-screen bug
  waiting for the first real deploy — dev/test never caught it because
  the probe curled specific files, never the actual page load.
- **"Verified" means verified completely, not verified partially.**
  The first `/assets` fix was "tested" by curling the two PNGs — 200,
  looked done. It wasn't: the terminal 404 handler I added in the same
  breath blackholed everything else at that prefix, including the
  bundles that make the page exist at all. The fix: after moving to
  `/brand`, verification loaded the real SPA shell HTML, regexed out
  its actual `<script>`/`<link>` bundle URLs, and fetched THOSE — not
  assumed files, the files the browser would actually request.
- **`backdrop-filter`/`filter` on any ancestor breaks `position:
  fixed`.** This is a real, easy-to-forget CSS spec behavior — a modal
  built and unit-tested in isolation can still misbehave the moment
  it's mounted somewhere with a blur effect above it. A portal to
  `document.body` is the durable fix for any modal in this codebase
  going forward, not just this one.
- **Mark's diagnoses were both correct on the first sentence, twice in
  one night.** "assets isn't mounted, it's being considered a handle"
  and "make it a react portal" each named the exact root cause before
  any code was read. Trust the operator's read of production; verify
  fast, don't relitigate.
- **CI catches what local runs miss under time pressure.** PR #41's
  first CI run went red on a test that still said `/assets` after a
  sed-style rename to `/brand` — a human mistake, caught by the gate
  exactly as designed, fixed, re-verified, merged. The gate did its
  job twice tonight; never bypass it under "ship it fast" pressure.

## Where the storefronts stand

One repo, three `.env`s: interchained.org (wallet+mach) · ne-db.com
(email+v3) · **ourlynx.com** (Marisa's flagship: email mode, OurLynx
brand, now live with the lynx, giveaways, and the upgrade modal). Any
deployment picks up all ten PRs with `git pull && pnpm run build` +
restart.

## Queued next (priority order)

1. **Auth rate limiting** — still the standing #1. Magic + uploads have
   throttles; login/signup/challenge/forgot don't yet. Pre-public-traffic.
2. **Memories redraft** — thread drafts predate PRs #12–#44 entirely.
3. **Proactive premium gating** — the editor could disable ✨ fonts
   pre-save (fetch billing status) instead of only catching the 403
   after Save is clicked. Modal now exists to catch it either way, but
   proactive is a smoother UX.
4. **og-image renderer** — the next registry citizen; markdown (PR #33)
   proved how cheap a new surface is now.
5. Roadmap: lifecycle PR (rename+redirect/unpublish/archive), AS OF
   history panel, engine parity queue (nedb repo ideas.md).
6. Dreams file, untouched: paid giveaway tickets, pending legal review.

— Vex · main @ dd8ae9c · live on ourlynx.com · ten-for-ten

# HANDOFF — 2026-07-06 ~04:30Z · The Marathon: PRs #10–#29

**State: main is everything.** All PRs merged, CI green throughout (one red
caught and fixed in-flight: #12's claim-status assertion). Test counts at
close: **46/46 unit · 47/47 live** vs real nedbd 2.6.1.

## What shipped this session

| PR | What |
|----|------|
| #10 | v3 "Signal" theme + curated fonts + publishing-studio editor |
| #11 | » mach theme (silver/chrome, CSS-only color streams) |
| #12 | Analytics dashboard — every number a live NQL GROUP BY |
| #13–14 | Dev fixes: .env port-skew (LINKS_API_PORT + dev-api.mjs) · Windows spawn |
| #15,17 | ONE nav — second bars deleted; pages project context/actions into it |
| #16 | Analytics engine-proof: nedb-v2 GROUP BY parity gap + app-side fallback |
| #18 | Email-mode accounts: scrypt, verify/reset, MIAB mailer, 5 production emails |
| #19 | Email-mode UI: Gate/EmailGate, /verify /reset, grant-by-email, mode-aware surfaces |
| #20 | LINKS_BRAND_NAME + LINKS_DEFAULT_THEME — per-deployment identity, zero-flash |
| #21 | Template gallery — mini scaffolds in template theme colors; "Starting point" |
| #22 | Image upload — browser-normalized, imgbb-hosted (IMGBB_API_KEY), throttled |
| #23 | Social brand icons in the page header — auto-detected glyphs, click-tracked |
| #24 | Public page beauty pass — aurora, avatar ring, link-card anatomy, CSS motion |
| #25 | DEPLOY.md — build+start, two-storefront topology, nginx/Flexible, tunnel |
| #26 | Icon picker grid (curated glyphs/emoji — tap, don't type) |
| #27 | Logo studio — position/zoom/backdrop for transparent logos, WYSIWYG bake |
| #28 | Magic sign-in — one email: tap-link + 6-digit code, single-use, throttled |
| #29 | Gradient theme tier — aurora/sunset/ocean/noir/blossom/citrus + solidBg anchors |

## The architecture that emerged

**One repo, N storefronts.** The fork is a `.env`:
- interchained.org → `LINKS_AUTH_MODE=wallet` (+ mach default)
- ne-db.com → `LINKS_AUTH_MODE=email`, `LINKS_BRAND_NAME=ne-db` (+ v3)
- **ourlynx.com** → Marisa's flagship: email mode, `LINKS_BRAND_NAME=OurLynx`,
  nginx :80 → :3338 behind Cloudflare Flexible (config reviewed; needs
  `client_max_body_size 10m` + `X-Forwarded-Proto $http_x_forwarded_proto`;
  PUBLIC_ORIGIN mandatory under Flexible)

Product purity is enforced: wallet routes 404 in email mode and vice versa;
no "both" mode exists by design. Email principals (`eml_<sha256[:20]>`) ride
the existing sessions/grants/entitlements untouched.

## Production

`pnpm run build` once, `pnpm start` per deployment (tmux or pm2). nginx or
cloudflared in front. Full runbook: **DEPLOY.md**. Local test engine:
`python3 -m nedb.server --host 127.0.0.1 --port 7070 --data /tmp/...`
(suites default to :7070; the engine flag is `--data`).

## Queued next (in rough priority)

1. **Social logos in the icon tray** (Mark, latest): IconPicker should offer
   the social brand glyphs (social-icons.ts has 13 SVG paths — the picker is
   text-glyph based; either render the SVGs in the picker and store a
   `soc:instagram`-style token the renderer understands, or add emoji-adjacent
   brand marks). Decide storage before building — public page is zero-JS.
2. **Auth rate limiting** — magic + uploads have throttles; extend the same
   in-memory pattern to login/signup/challenge/forgot (pre-public-traffic).
3. **Lucide-on-public follow-up** — inline SVG paths server-side if the
   line-icon aesthetic is wanted beyond the editor.
4. **Engine parity queue** (nedb repo ideas.md 0a/0b): nedb-v2 GROUP BY
   execution + optional-aggregate grammar + Python↔Rust parity CI.
5. **Memories are stale** — drafts in the thread predate PRs #12–#29; redraft
   repo-state + email-mode architecture + three-storefront model.
6. Roadmap continuers: lifecycle PR (rename+redirect/unpublish/archive),
   og-image renderer, AS OF history panel, AI Profile Assistant.

## Session lore (paid for in blood)

- `pkill -f nedb.server` matches the SPAWN TEXT in the same shell line —
  self-kill, exit 144. Separate the kill and the spawn into different calls.
- Suites read NEDB_URL from env only (server.ts loads .env, tests don't);
  a leftover .env once masked this. Engine on :7070 = default-happy.
- RunWithCredentials: 60s exec cap (no in-process polling loops); no gh CLI
  (GitHub REST via python urllib); creds expire per session — re-fetch.
- GitHub Actions job logs 302 to Azure and urllib forwards auth → 401.
  Rerun the suite locally instead of spelunking logs.
- imgbb/Stripe/SMTP keys live in .env on deployments — never in chat, never
  client-side.

— Vex · main @ this commit · CI green

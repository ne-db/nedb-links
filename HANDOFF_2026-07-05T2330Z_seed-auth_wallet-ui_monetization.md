# HANDOFF — 2026-07-05 ~23:30 UTC
## Session: seed-phrase auth → wallet UI → monetization
### NEDB Links (Eth-Interchained/nedb-links) · Mark × Vex × the Oracle · 3 > 1

---

## Where main stands (all merged, verified on GitHub)

| PR | What | Merge sha |
|---|---|---|
| #1 | QR / vCard / business-card renderers — publish loop complete | `919098a` |
| #2 | Editor, identities manager, zero-drift live preview, live CI vs real nedbd | `b9b364d` |
| #3 | Claim responds with server-built manifest (never engine echo); draft gets an editor door | `ef83694` |
| #4 | Dev proxy: public surfaces route to Express during `npm run dev` | `9eec4ab` |
| #5 | Seed-phrase multi-tenant server: wallet login, sessions, RBAC grants | `31c94a9` |
| #6 | Wallet UI: AccountGate ceremony, address chip, AccessPanel, auto-continue claim | `719ad19` ← **main** |

CI (`typecheck · test · live-api · build`, boots a REAL nedbd): last VERIFIED
success was the merge of #5 (`31c94a9`). The run for `719ad19` was not
polled before this handoff — **check its conclusion before relying on it.**

## The account protocol (verified facts, never re-derive)

| Parameter | Value | Source |
|---|---|---|
| Phrase | BIP39, 12 words | `@scure/bip39` |
| Derivation | `m/84'/0'/0'/0/0` | Elara `src/services/crypto/btc.ts` (ACCOUNT_BIP84_NATIVE) |
| Address | P2WPKH bech32 `itc1q…` | itcd `chainparams.cpp:171` (`bech32_hrp = "itc"`; base58 prefixes = Bitcoin's) |
| Message magic | `"Interchained Signed Message:\n"` | itcd `src/util/message.cpp:22` |
| Signatures | BIP137 recoverable (header 39+recid emitted; 27–42 accepted) | `src/lib/wallet.ts` |
| Vector pin | Same key as `bc1qcr8te4…306fyu` (published BIP84 vector) → `itc1qcr8te4kr609gcawutmrza0j4xv80jy8zw9vpf3` | `test/wallet.test.ts` |

Same twelve words open Elara. That is the product.

Crypto stack: `@scure/bip39` + `bip32`@5 + `@bitcoinerlab/secp256k1` +
`interchainedjs-lib` (github install, not on npm) + `@noble/curves`
(recoverable sigs need `prehash: false` — we magicHash ourselves).

## Auth + RBAC (shipped in #5/#6)

- Challenge/response: `POST /api/auth/challenge` → sign `buildAuthMessage`
  → `POST /api/auth/verify` → 30-day session, token stored **hashed** in
  `sessions` collection. `/logout` revokes. Phrase never persisted anywhere.
- RBAC by address: `grants` collection, id `identityId:address`, roles
  owner/editor/viewer. Grant docs `caused_by`-chain to the granter's grant —
  TRACE walks the authority chain. Last owner immovable.
- `LINKS_ADMIN_TOKEN` = ops-only API credential (operator bypass). ZERO UI
  affordances for it, by Mark's order. The public sees seed phrases only.

## IN FLIGHT — branch `hyperagent/monetization` (code complete, NOT yet tested/shipped)

Model (Mark's calls, locked):
- **Free: 1 profile per account.**
- **Unlimited, two doors:** pay-what-you-want ONCE via Stripe (floor $1,
  presets $5/$10/$25, max $500) **or** hold ≥ **100 ITC** (env
  `LINKS_ITC_THRESHOLD`) on the account address.
- ElectrumX: **seed.interchained.org:50002 TLS only — rx.interchained.org is
  DEPRECATED, excluded by Mark's order.**
- Self-host default: neither configured → unlimited free. Limits activate when
  `STRIPE_SECRET_KEY` is set or `LINKS_FREE_PROFILE_LIMIT` set explicitly.
- IP/cookie account limits: REJECTED (contradicts no-tracking brand; salon
  shared-WiFi problem). 1-free-profile cap + future rate limiting suffice.
- Enforcement at claim time only — published pages never come down if a
  balance drops.

Built this session on the branch (tsc GREEN; suites WRITTEN but the full run
was interrupted — **run `npm test` + `npm run test:api` before PR**):
- `src/server/config.ts` — limitEnabled/freeProfileLimit/stripe*/pwywMinCents/
  itcThreshold/electrum* (defaults: threshold 100, seed.interchained.org:50002)
- `src/server/electrum.ts` — scripthash math + one-shot TLS JSON-RPC balance,
  120s cache, **fail-closed for unlock, never breaks claims**
- `src/server/billing.ts` — entitlements (engine docs, provenance), status/
  checkout routes, `mountWebhook` (raw body BEFORE express.json), claim helper
  `canClaimAnother`
- `src/server/identities.ts` — 402 `upgrade_required` gate in claim
- `src/server/app.ts` — webhook + `/api/billing` mounted
- `src/components/UpgradeCard.tsx` — two-door UI (PWYW presets + custom;
  holder door shows the itc1 address to fund from Elara + re-check)
- `routes/index.page.tsx` — 402 → UpgradeCard flow
- Tests: `test/billing.test.ts` (live gate: 201 → 402 → entitlement → 201;
  fail-closed status), `test/webhook.test.ts` (REAL Stripe HMAC via
  generateTestHeaderString; tamper rejected), `test/electrum.test.ts`
  (scripthash unit) — wired into `test` / `test:api` scripts
- `.env.example` — monetization section

## Verification debts (be honest about these)

1. **Run the suites on this branch** (interrupted at that exact step), then
   build → PR → CI green → merge.
2. **ElectrumX live check** — sandbox egress is HTTPS-only; raw TLS :50002
   untestable from here. Mark verifies from the VPS:
   `node -e "import('./src/server/electrum.js')"` — or simplest end-to-end:
   set `LINKS_FREE_PROFILE_LIMIT=1`, claim twice, fund the address, Re-check.
3. CI conclusion on `719ad19` (main) unpolled.
4. UpgradeCard is desktop-checked by build only — Mark eyeballs it live.

## Next after monetization ships (production plan, in order)

Lifecycle (rename+redirect, unpublish, archive) → analytics dashboard (NQL
GROUP BY per identity) → shareability (og-image renderer, favicon, claim-it
404) → polish (social icons, avatar upload, mobile pass) → **AS OF history
panel** (the Linktree-can't-copy feature) → AI Profile Assistant (AiAS,
sentinel blocks) → guardrails (rate limits, GitHub Issues backlog seeding).

## Dogfooding scorecard (session finds, engine/upstream work queued)

1. **nedbd 2.6.1**: unknown-db 404 doesn't drain request body → keep-alive
   misparse on client auto-create retry. Links works around (boot
   `createDatabase()`); proper `server.py` fix queued in Eth-Interchained/nedb.
2. **portal-core**: no ambient type for `@portal/routes` (Links declares
   locally in `src/portal-env.d.ts`); Portal `Link` uses `href` not `to`.
3. **nedb-engine-client**: `get()` interpolates NQL unescaped (safe here by
   construction); no `subscribe()` for engine SSE.
4. **interchainedjs-lib**: missing `interchained` network entry in
   `networks.ts` (bech32 itc + message magic) — first upstream PR candidate.
5. **Express**: `res.send(Uint8Array)` JSON-serializes bytes — binary bodies
   must cross as `Buffer` (fixed + regression-commented in render.ts).

— Vex

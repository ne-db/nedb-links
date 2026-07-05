/**
 * Monetization gate — live against a real nedbd.
 *
 * Free tier: one profile. Second claim → 402. A supporter entitlement
 * (written the way the webhook writes it) unlocks unlimited. The holder
 * door fails CLOSED in this environment (no ElectrumX egress from the
 * sandbox) — which exercises exactly the posture we want: unverifiable
 * never means unlocked, and claims never 500.
 */

import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import type { Server } from "node:http";

process.env.NEDB_DB = `links_billing_${Date.now().toString(36)}`;
delete process.env.LINKS_ADMIN_TOKEN;
delete process.env.STRIPE_SECRET_KEY;
process.env.LINKS_FREE_PROFILE_LIMIT = "1"; // activates limits without Stripe
process.env.ELECTRUMX_HOST = "127.0.0.1"; // unroutable here: fail-closed path
process.env.ELECTRUMX_PORT = "1";

const { createApp, ensureDatabase } = await import("../src/server/app");
const { db } = await import("../src/server/db");
const { deriveAccount, generatePhrase, signMessage } = await import("../src/lib/wallet");

let server: Server;
let base: string;
let token = "";
let address = "";

async function login(): Promise<void> {
  const phrase = generatePhrase();
  const acct = await deriveAccount(phrase);
  address = acct.address;
  const chal = (await (
    await fetch(`${base}/api/auth/challenge`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ address }),
    })
  ).json()) as { challengeId: string; message: string };
  const signature = await signMessage(phrase, chal.message);
  const r = await fetch(`${base}/api/auth/verify`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ challengeId: chal.challengeId, address, signature }),
  });
  token = ((await r.json()) as { token: string }).token;
}

function authed(): Record<string, string> {
  return { authorization: `Bearer ${token}`, "content-type": "application/json" };
}

function claimBody(handle: string): string {
  return JSON.stringify({ handle, displayName: "Gate Test", template: "creator" });
}

before(async () => {
  assert.ok(await db.ping(), "nedbd required");
  await ensureDatabase();
  server = createApp().listen(0);
  const addr = server.address();
  assert.ok(addr && typeof addr === "object");
  base = `http://127.0.0.1:${addr.port}`;
  await login();
});

after(async () => {
  server?.close();
  try {
    await db.dropDatabase();
  } catch {
    /* best-effort */
  }
});

test("first profile is free", async () => {
  const r = await fetch(`${base}/api/identities`, {
    method: "POST",
    headers: authed(),
    body: claimBody("gatefree"),
  });
  assert.equal(r.status, 201);
});

test("second claim hits the 402 gate with upgrade code", async () => {
  const r = await fetch(`${base}/api/identities`, {
    method: "POST",
    headers: authed(),
    body: claimBody("gatesecond"),
  });
  assert.equal(r.status, 402);
  const j = (await r.json()) as { code: string };
  assert.equal(j.code, "upgrade_required");
});

test("billing status reports the gate honestly (holder check fail-closed)", async () => {
  const r = await fetch(`${base}/api/billing/status`, { headers: authed() });
  assert.equal(r.status, 200);
  const s = (await r.json()) as {
    limitEnabled: boolean;
    owned: number;
    unlimited: boolean;
    fiatDoor: boolean;
    holderCheckAvailable: boolean;
    itcThreshold: number;
  };
  assert.equal(s.limitEnabled, true);
  assert.equal(s.owned, 1);
  assert.equal(s.unlimited, false, "unverifiable holder check never unlocks");
  assert.equal(s.holderCheckAvailable, false, "electrum unreachable reported honestly");
  assert.equal(s.fiatDoor, false, "no Stripe key: fiat door closed");
  assert.equal(s.itcThreshold, 100, "Mark's threshold");
});

test("checkout without Stripe answers 503, not a crash", async () => {
  const r = await fetch(`${base}/api/billing/checkout`, {
    method: "POST",
    headers: authed(),
    body: JSON.stringify({ amountCents: 1000 }),
  });
  assert.equal(r.status, 503);
});

test("a supporter entitlement unlocks unlimited", async () => {
  // Written exactly the way the webhook writes it.
  await db.put(
    "entitlements",
    address,
    {
      address,
      kind: "supporter",
      amountCents: 500,
      currency: "usd",
      stripeSessionId: "cs_test_direct",
      createdAt: new Date().toISOString(),
    },
    { evidence: "test supporter entitlement" },
  );

  const status = (await (
    await fetch(`${base}/api/billing/status`, { headers: authed() })
  ).json()) as { unlimited: boolean; via: string };
  assert.equal(status.unlimited, true);
  assert.equal(status.via, "supporter");

  const r = await fetch(`${base}/api/identities`, {
    method: "POST",
    headers: authed(),
    body: claimBody("gatesecond"),
  });
  assert.equal(r.status, 201, "supporter claims freely");
});

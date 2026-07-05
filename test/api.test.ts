/**
 * Live API suite — the REAL app against a REAL nedbd.
 *
 * No mocks: these tests boot createApp() on an ephemeral port, point it
 * at a scratch database inside a running nedbd (NEDB_URL, default
 * :7070), and walk the entire product loop over actual HTTP. The engine
 * is under test as much as the app — this suite is part of the
 * dogfooding mission.
 *
 * Run with: npm run test:api   (requires nedbd running)
 */

import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import type { Server } from "node:http";

// Scratch database per run — set BEFORE the app modules import config.
process.env.NEDB_DB = `links_test_${Date.now().toString(36)}`;
delete process.env.LINKS_ADMIN_TOKEN; // open mode; auth is covered in auth.test.ts

const { createApp, ensureDatabase } = await import("../src/server/app");
const { db } = await import("../src/server/db");
const { deriveAccount, generatePhrase, signMessage } = await import("../src/lib/wallet");

let server: Server;
let base: string;
let session = "";

/** Wallet login — the suite authenticates like a real user. */
async function walletLogin(): Promise<string> {
  const phrase = generatePhrase();
  const { address } = await deriveAccount(phrase);
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
  assert.equal(r.status, 200, "wallet login succeeds");
  return ((await r.json()) as { token: string }).token;
}

function authed(): Record<string, string> {
  return { authorization: `Bearer ${session}`, "content-type": "application/json" };
}

before(async () => {
  const reachable = await db.ping();
  assert.ok(
    reachable,
    `nedbd is not reachable at ${process.env.NEDB_URL ?? "http://127.0.0.1:7070"} — start it before running test:api`,
  );
  await ensureDatabase();
  server = createApp().listen(0);
  const addr = server.address();
  assert.ok(addr && typeof addr === "object");
  base = `http://127.0.0.1:${addr.port}`;
  session = await walletLogin();
});

after(async () => {
  server?.close();
  try {
    await db.dropDatabase();
  } catch {
    /* scratch cleanup is best-effort */
  }
});

let identityId = "";

test("health reports the engine", async () => {
  const r = await fetch(`${base}/api/health`);
  const j = (await r.json()) as { links: string; nedb: { ok: boolean; version?: string } };
  assert.equal(r.status, 200);
  assert.equal(j.links, "ok");
  assert.equal(j.nedb.ok, true);
});

test("availability: free, invalid, reserved", async () => {
  const free = await (await fetch(`${base}/api/handles/smoketest/availability`)).json() as { available: boolean };
  assert.equal(free.available, true);
  const bad = await (await fetch(`${base}/api/handles/UPPER!/availability`)).json() as { available: boolean; reason?: string };
  assert.equal(bad.available, false);
  const reserved = await (await fetch(`${base}/api/handles/api/availability`)).json() as { available: boolean; reason?: string };
  assert.equal(reserved.available, false);
  assert.equal(reserved.reason, "invalid");
});

test("claim seeds a complete identity from a template", async () => {
  const r = await fetch(`${base}/api/identities`, {
    method: "POST",
    headers: authed(),
    body: JSON.stringify({ handle: "smoketest", displayName: "Smoke Test", template: "developer" }),
  });
  assert.equal(r.status, 201);
  const j = (await r.json()) as { manifest: { identityId: string; blocks: unknown[]; status: string; theme: string }; seq: number };
  identityId = j.manifest.identityId;
  assert.match(identityId, /^idn_/);
  assert.equal(j.manifest.status, "draft");
  assert.ok(j.manifest.blocks.length >= 4, "template seeded blocks");
  assert.ok(j.seq >= 1, "engine seq returned");
});

test("double claim is rejected by read-back verification", async () => {
  const r = await fetch(`${base}/api/identities`, {
    method: "POST",
    headers: authed(),
    body: JSON.stringify({ handle: "smoketest", displayName: "Imposter" }),
  });
  assert.equal(r.status, 409);
});

test("list returns summaries newest first", async () => {
  const r = await fetch(`${base}/api/identities`, { headers: authed() });
  assert.equal(r.status, 200);
  const j = (await r.json()) as { identities: Array<{ identityId: string; handle: string; blockCount: number }> };
  assert.equal(j.identities.length, 1);
  assert.equal(j.identities[0].handle, "smoketest");
  assert.ok(j.identities[0].blockCount >= 4);
});

test("edit chains provenance and revalidates blocks", async () => {
  const get = (await (await fetch(`${base}/api/identities/${identityId}`, { headers: authed() })).json()) as { manifest: { blocks: Array<Record<string, unknown>> } };
  const blocks = [
    ...get.manifest.blocks,
    { id: "blk_apitest", type: "link", order: get.manifest.blocks.length, data: { label: "API test", url: "https://example.com" } },
  ];
  const r = await fetch(`${base}/api/identities/${identityId}`, {
    method: "PUT",
    headers: authed(),
    body: JSON.stringify({ blocks, bio: "edited by the live API suite" }),
  });
  assert.equal(r.status, 200);
  const j = (await r.json()) as { manifest: { blocks: unknown[]; bio: string; identityId: string; handle: string }; seq: number; head: string };
  assert.equal(j.manifest.bio, "edited by the live API suite");
  // The API responds with the server-constructed manifest — never the
  // engine's put echo (regression: empty claim card on older daemons).
  assert.equal(j.manifest.identityId, identityId);
  assert.equal(j.manifest.handle, "smoketest");
  assert.ok(j.head.length >= 32, "Merkle head returned");

  const bad = await fetch(`${base}/api/identities/${identityId}`, {
    method: "PUT",
    headers: authed(),
    body: JSON.stringify({ blocks: [{ id: "x", type: "nope", order: 0, data: {} }] }),
  });
  assert.equal(bad.status, 400, "unknown block type rejected");
});

test("custom palettes save with hex validation and render publicly", async () => {
  const custom = { bg: "#101820", card: "#182028", text: "#eef2f6", sub: "#8899aa", accent: "#ff5e00" };
  const ok = await fetch(`${base}/api/identities/${identityId}`, {
    method: "PUT",
    headers: authed(),
    body: JSON.stringify({ themeCustom: custom }),
  });
  assert.equal(ok.status, 200);
  const j = (await ok.json()) as { manifest: { themeCustom?: { accent: string } } };
  assert.equal(j.manifest.themeCustom?.accent, "#ff5e00", "palette persisted");

  const bad = await fetch(`${base}/api/identities/${identityId}`, {
    method: "PUT",
    headers: authed(),
    body: JSON.stringify({ themeCustom: { ...custom, accent: "red; } body { evil" } }),
  });
  assert.equal(bad.status, 400, "non-hex colors rejected — no CSS injection path");

  const clear = await fetch(`${base}/api/identities/${identityId}`, {
    method: "PUT",
    headers: authed(),
    body: JSON.stringify({ themeCustom: null }),
  });
  assert.equal(clear.status, 200);
  const cleared = (await clear.json()) as { manifest: { themeCustom?: unknown } };
  assert.equal(cleared.manifest.themeCustom, undefined, "explicit null clears the palette");
});

test("preview renders a DRAFT through the real renderer", async () => {
  const r = await fetch(`${base}/api/preview`, {
    method: "POST",
    headers: authed(),
    body: JSON.stringify({
      identityId: "idn_preview",
      handle: "previewonly",
      displayName: "Never Saved",
      theme: "terminal",
      blocks: [{ id: "b1", type: "header", order: 0, data: { text: "Draft only" } }],
    }),
  });
  assert.equal(r.status, 200);
  const html = await r.text();
  assert.ok(html.includes("Never Saved"));
  assert.ok(html.includes("Draft only"));
  // Draft was never written: its content must not exist publicly.
  // (Status varies by env — SPA shell with dist, 503 without — the
  // invariant is that preview content never leaks to a public URL.)
  const pub = await (await fetch(`${base}/previewonly`)).text();
  assert.equal(pub.includes("Never Saved"), false, "preview draft never leaks publicly");
});

test("unpublished identities are not publicly rendered", async () => {
  const body = await (await fetch(`${base}/smoketest`)).text();
  assert.equal(body.includes("Smoke Test"), false, "draft content never leaks publicly");
});

test("publish flips status and the profile goes live", async () => {
  const r = await fetch(`${base}/api/identities/${identityId}/publish`, { method: "POST", headers: authed() });
  assert.equal(r.status, 200);
  const j = (await r.json()) as { manifest: { status: string; publishedAt?: string; identityId: string; handle: string; blocks: unknown[] } };
  assert.equal(j.manifest.status, "published");
  assert.ok(j.manifest.publishedAt);
  assert.equal(j.manifest.identityId, identityId, "publish responds with full server-built manifest");
  assert.equal(j.manifest.handle, "smoketest");
  assert.ok(j.manifest.blocks.length >= 4, "blocks present in publish response");

  const html = await (await fetch(`${base}/smoketest`)).text();
  assert.ok(html.includes("Smoke Test"), "public profile renders");
  assert.ok(html.includes("/go/"), "click tracking wired");
});

test("every registered surface answers on the wire", async () => {
  const vcf = await fetch(`${base}/smoketest?format=vcard`);
  assert.equal(vcf.status, 200);
  assert.match(vcf.headers.get("content-type") ?? "", /text\/vcard/);
  const body = await vcf.text();
  assert.ok(body.startsWith("BEGIN:VCARD\r\n"), "vCard CRLF structure");
  assert.ok(body.includes(`UID:urn:nedb-links:${identityId}`), "stable UID");

  const qr = await fetch(`${base}/smoketest?format=qr&type=png`);
  assert.equal(qr.status, 200);
  assert.equal(qr.headers.get("content-type"), "image/png");
  const bytes = new Uint8Array(await qr.arrayBuffer());
  assert.equal(bytes[0], 0x89, "PNG magic — binary body crosses Express as Buffer");
  assert.equal(bytes[1], 0x50);

  const card = await (await fetch(`${base}/smoketest?format=card`)).text();
  assert.ok(card.includes("Save contact"));

  const json = (await (await fetch(`${base}/smoketest?format=json`)).json()) as { manifest: { handle: string } };
  assert.equal(json.manifest.handle, "smoketest");
});

test("clicks redirect and analytics aggregate in the engine", async () => {
  const go = await fetch(`${base}/go/${identityId}/blk_apitest?to=${encodeURIComponent("https://example.com")}&src=qr`, { redirect: "manual" });
  assert.equal(go.status, 302);
  assert.equal(go.headers.get("location"), "https://example.com");

  await new Promise((r) => setTimeout(r, 300)); // fire-and-forget event lands
  const rows = await db.query("FROM events GROUP BY kind COUNT");
  const kinds = Object.fromEntries(rows.map((r) => [r.kind, r.count]));
  assert.ok(Number(kinds.link_click) >= 1, "link_click recorded");
  assert.ok(Number(kinds.profile_view) >= 1, "profile_view recorded");
  assert.ok(Number(kinds.vcard_download) >= 1, "vcard_download recorded");
});

test("the engine verifies the whole database tamper-evident", async () => {
  const report = await db.verify();
  assert.equal(report.ok, true, "verify ok");
  assert.ok(report.seq > 0);
});

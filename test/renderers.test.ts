/**
 * Renderer suite — the publish loop outputs, held to spec.
 *
 * Run: npm test  (node:test via tsx — no framework dependency)
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { SCHEMA_VERSION, type IdentityManifest } from "../src/lib/identity";
import { getRenderer, listRenderers, manifestCapabilities } from "../src/lib/registry";
import "../src/lib/blocks/builtin";
import "../src/lib/templates/builtin";
import { renderProfileHtml } from "../src/lib/renderers/html";
import { renderCardHtml } from "../src/lib/renderers/card";
import { buildQrPng, buildQrSvg, shareUrl } from "../src/lib/renderers/qr";
import { buildVcard, vEscape, vFold, vName, vRev } from "../src/lib/renderers/vcard";

const CTX = { origin: "https://links.example.com" };

function fixture(overrides: Partial<IdentityManifest> = {}): IdentityManifest {
  return {
    schemaVersion: SCHEMA_VERSION,
    identityId: "idn_test1234567890abcdef",
    identityType: "business",
    owner: "admin",
    handle: "marisayvettehair",
    displayName: "Marisa Yvette",
    bio: "Book your next appointment; walk-ins welcome, too.",
    theme: "rosegold",
    blocks: [
      { id: "blk_1", type: "link", order: 0, data: { label: "Book an appointment", url: "https://book.example.com", icon: "✂" } },
      { id: "blk_2", type: "link", order: 1, data: { label: "Call us", url: "tel:+14075551234" } },
      { id: "blk_3", type: "link", order: 2, data: { label: "Email", url: "mailto:hello@example.com" } },
      { id: "blk_4", type: "social", order: 3, data: { links: [{ network: "Instagram", url: "https://instagram.com/marisa" }] } },
      { id: "blk_5", type: "header", order: 4, data: { text: "Hours" } },
    ],
    capabilities: [],
    renderers: [],
    status: "published",
    publishedAt: "2026-07-05T12:00:00.000Z",
    createdAt: "2026-07-05T11:00:00.000Z",
    updatedAt: "2026-07-05T12:34:56.789Z",
    ...overrides,
  };
}

// ── Registry ─────────────────────────────────────────────────────────────────

test("all five surfaces are registered renderers", async () => {
  await import("../src/lib/renderers/json");
  const ids = listRenderers().map((r) => r.id).sort();
  for (const id of ["card", "html", "json", "qr", "vcard"]) {
    assert.ok(ids.includes(id), `renderer registered: ${id}`);
  }
});

test("capabilities aggregate from block definitions", () => {
  const caps = manifestCapabilities(fixture().blocks);
  assert.ok(caps.includes("qr"), "link blocks advertise qr");
  assert.ok(caps.includes("printable"), "header blocks advertise printable");
});

// ── vCard: spec compliance ───────────────────────────────────────────────────

test("vCard uses CRLF line endings exclusively", () => {
  const v = buildVcard(fixture(), CTX.origin);
  assert.ok(v.includes("\r\n"), "contains CRLF");
  assert.equal(v.replaceAll("\r\n", "").includes("\n"), false, "no bare LF remains");
  assert.ok(v.endsWith("END:VCARD\r\n"), "terminates with END:VCARD CRLF");
});

test("vCard escapes TEXT values per RFC 2426", () => {
  assert.equal(vEscape("a,b;c\nd\\e"), "a\\,b\\;c\\nd\\\\e");
  const v = buildVcard(fixture(), CTX.origin);
  assert.ok(
    v.includes("NOTE:Book your next appointment\\; walk-ins welcome\\, too."),
    "bio semicolons and commas escaped",
  );
});

test("vCard folds lines longer than 75 octets", () => {
  const long = "NOTE:" + "x".repeat(200);
  const folded = vFold(long);
  for (const physical of folded.split("\r\n")) {
    assert.ok(
      new TextEncoder().encode(physical).length <= 75,
      `physical line within 75 octets: ${physical.length}`,
    );
  }
  assert.ok(folded.includes("\r\n "), "continuation lines begin with a space");
  const bio = "long ".repeat(60);
  const v = buildVcard(fixture({ bio }), CTX.origin);
  const unfolded = v.replaceAll("\r\n ", "");
  assert.ok(unfolded.includes(bio.trimEnd().replaceAll(",", "\\,")), "unfolding restores content");
});

test("vCard N parses display names best-effort", () => {
  assert.equal(vName("Marisa Yvette"), "Yvette;Marisa;;;");
  assert.equal(vName("Cher"), ";Cher;;;");
  assert.equal(vName("Mary Jane Watson"), "Watson;Mary Jane;;;");
});

test("vCard carries stable UID from immutable identityId", () => {
  const a = buildVcard(fixture(), CTX.origin);
  const b = buildVcard(fixture({ displayName: "Renamed Entirely" }), CTX.origin);
  const uid = "UID:urn:nedb-links:idn_test1234567890abcdef";
  assert.ok(a.includes(uid) && b.includes(uid), "UID survives display renames");
});

test("vCard maps tel:/mailto: links to TEL and EMAIL", () => {
  const v = buildVcard(fixture(), CTX.origin);
  assert.ok(v.includes("TEL;TYPE=VOICE:+14075551234"));
  assert.ok(v.includes("EMAIL;TYPE=INTERNET:hello@example.com"));
});

test("vCard labels URLs for iOS and lists social profiles", () => {
  const v = buildVcard(fixture(), CTX.origin);
  assert.ok(v.includes("item1.URL:https://book.example.com"));
  assert.ok(v.includes("item1.X-ABLabel:Book an appointment"));
  assert.ok(v.includes("X-SOCIALPROFILE;TYPE=instagram:https://instagram.com/marisa"));
});

test("vCard REV derives from updatedAt", () => {
  assert.equal(vRev("2026-07-05T12:34:56.789Z"), "20260705T123456Z");
  const v = buildVcard(fixture(), CTX.origin);
  assert.ok(v.includes("REV:20260705T123456Z"));
});

test("vCard marks business identities with ORG", () => {
  const v = buildVcard(fixture(), CTX.origin);
  assert.ok(v.includes("ORG:Marisa Yvette"));
  const p = buildVcard(fixture({ identityType: "personal" }), CTX.origin);
  assert.equal(p.includes("ORG:"), false);
});

// ── QR ───────────────────────────────────────────────────────────────────────

test("share URL carries the qr source tag", () => {
  assert.equal(
    shareUrl(fixture(), CTX.origin),
    "https://links.example.com/marisayvettehair?src=qr",
  );
});

test("QR SVG is embeddable markup", async () => {
  const svg = await buildQrSvg("https://links.example.com/x?src=qr");
  assert.ok(svg.includes("<svg"), "svg root present");
  assert.ok(svg.includes("path"), "modules drawn");
});

test("QR PNG carries the PNG signature at print resolution", async () => {
  const png = await buildQrPng("https://links.example.com/x?src=qr", 1024);
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  sig.forEach((byte, i) => assert.equal(png[i], byte, `PNG magic byte ${i}`));
  assert.ok(png.length > 1000, "non-trivial payload");
});

test("QR renderer honors type and download options", async () => {
  const qr = getRenderer("qr");
  assert.ok(qr, "qr renderer registered");
  const svg = await qr.render(fixture(), { ...CTX, options: {} });
  assert.equal(svg.contentType.startsWith("image/svg+xml"), true);
  assert.equal(svg.filename, undefined, "inline by default");
  const png = await qr.render(fixture(), { ...CTX, options: { type: "png", download: "1" } });
  assert.equal(png.contentType, "image/png");
  assert.equal(png.filename, "marisayvettehair-qr.png");
});

// ── Business card ────────────────────────────────────────────────────────────

test("card embeds identity, QR, and save-contact action", async () => {
  const html = await renderCardHtml(fixture(), CTX);
  assert.ok(html.includes("Marisa Yvette"));
  assert.ok(html.includes("@marisayvettehair"));
  assert.ok(html.includes("<svg"), "QR inlined as SVG");
  assert.ok(html.includes("?format=vcard"), "save-contact links the vCard surface");
  assert.ok(html.includes("@page { size: 3.5in 2in; margin: 0; }"), "print-true card size");
});

test("card escapes hostile display names", async () => {
  const html = await renderCardHtml(
    fixture({ displayName: '<script>alert("x")</script>' }),
    CTX,
  );
  assert.equal(html.includes("<script>alert"), false, "no raw script tag");
  assert.ok(html.includes("&lt;script&gt;"), "escaped rendering");
});

// ── Placeholder semantics: saveable, never rendered ──────────────────────────

test("placeholder URLs are saveable but never rendered on any surface", async () => {
  const { getBlock } = await import("../src/lib/registry");
  const linkDef = getBlock("link");
  assert.ok(linkDef, "link block registered");
  // Template default ("https://") validates — drafting never fights the user.
  assert.equal(linkDef.schema.safeParse(linkDef.defaults()).success, true);
  // But a filled invalid string still fails.
  assert.equal(linkDef.schema.safeParse({ label: "x", url: "not a url" }).success, false);

  const m = fixture({
    blocks: [
      { id: "blk_ph", type: "link", order: 0, data: { label: "Unfilled template link", url: "https://" } },
      { id: "blk_ok", type: "link", order: 1, data: { label: "Real link", url: "https://real.example.com" } },
      { id: "blk_soc", type: "social", order: 2, data: { links: [{ network: "x", url: "https://" }] } },
      { id: "blk_emb", type: "embed", order: 3, data: { url: "https://", title: "empty" } },
    ],
  });
  const html = renderProfileHtml(m, CTX);
  assert.equal(html.includes("Unfilled template link"), false, "placeholder link hidden");
  assert.ok(html.includes("Real link"), "filled link renders");
  assert.equal(html.includes('class="sr"'), false, "social row with only placeholders hidden");
  assert.equal(html.includes('class="em"'), false, "placeholder embed hidden");

  const v = buildVcard(m, CTX.origin);
  assert.equal(v.includes("item1.URL:https://\r\n"), false, "vCard skips placeholder URLs");
  assert.ok(v.includes("item1.URL:https://real.example.com"), "vCard keeps filled URLs");
});

// ── Custom palette (MySpace energy, Links safety) ────────────────────────────

test("a custom palette overrides the named theme on every surface", async () => {
  const custom = { bg: "#112233", card: "#223344", text: "#f0f0f0", sub: "#aabbcc", accent: "#ff6600" };
  const m = fixture({ theme: "midnight", themeCustom: custom });
  const html = renderProfileHtml(m, CTX);
  assert.ok(html.includes("background: #112233"), "custom page color renders");
  assert.ok(html.includes("#ff6600"), "custom accent renders");
  assert.equal(html.includes("#070a12"), false, "named theme fully overridden");

  const card = await renderCardHtml(m, CTX);
  assert.ok(card.includes("#ff6600"), "business card follows the custom palette");
});

test("curated fonts inject Google link and font-family on profile + card", async () => {
  const custom = {
    bg: "#112233", card: "#223344", text: "#f0f0f0", sub: "#aabbcc", accent: "#ff6600",
    headingFont: "playfair" as const, bodyFont: "lora" as const,
  };
  const m = fixture({ themeCustom: custom });
  const html = renderProfileHtml(m, CTX);
  assert.ok(html.includes("fonts.googleapis.com/css2?family=Playfair+Display"), "Google link built from OUR map");
  assert.ok(html.includes("family=Lora"), "body family included");
  assert.ok(html.includes("h1, .hd { font-family: 'Playfair Display', Georgia, serif; }"), "heading font applied");
  assert.ok(html.includes("'Lora', Georgia, serif"), "body font applied");

  const card = await renderCardHtml(m, CTX);
  assert.ok(card.includes("Playfair+Display"), "card loads the same fonts");

  // System default: no external font link at all.
  const plain = renderProfileHtml(fixture(), CTX);
  assert.equal(plain.includes("fonts.googleapis.com"), false, "no fonts link when system");
});

// ── Profile page ─────────────────────────────────────────────────────────────

test("profile page escapes content and routes clicks through /go", () => {
  const html = renderProfileHtml(fixture({ bio: '<img onerror=alert(1)>' }), CTX);
  assert.equal(html.includes("<img onerror"), false, "bio escaped");
  assert.ok(html.includes("/go/idn_test1234567890abcdef/blk_1?to="), "click tracking URLs");
});

test("signal theme — the v3 studio palette is a first-class renderer theme", () => {
  const html = renderProfileHtml(fixture({ theme: "signal" }), CTX);
  assert.ok(html.includes("#0f172a"), "charcoal canvas");
  assert.ok(html.includes("#60a5fa"), "signal blue accent");
  // Unknown themes still fall back to pro — signal must not break that.
  const fallback = renderProfileHtml(fixture({ theme: "definitely-not-real" }), CTX);
  assert.ok(fallback.includes("#0e7490"), "unknown theme falls back to pro accent");
});

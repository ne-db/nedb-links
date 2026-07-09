/**
 * /demo — what done looks like, rendered by the REAL pipeline.
 *
 * The homepage's job is to sell the destination, and nothing we could
 * write sells harder than the artifact itself. This route feeds a
 * fixed manifest through the exact renderer public pages use: no
 * mockup to drift out of date, no screenshot to go stale, no engine
 * writes to pollute analytics. The homepage embeds it in a phone
 * frame; it also stands alone as the shareable "see a finished page."
 *
 * Maya is fictional — client-shaped on purpose (Marisa's world, not
 * a developer's): a booking link, a price list, socials, hours, and
 * the save-my-contact row.
 */

import { Router } from "express";

import { SCHEMA_VERSION, type IdentityManifest } from "../lib/identity";
import { renderProfileHtml } from "../lib/renderers/html";
import { config } from "./config";

export const demo = Router();

const DEMO: IdentityManifest = {
  schemaVersion: SCHEMA_VERSION,
  identityId: "idn_demo000000000000000",
  identityType: "business",
  owner: "demo",
  handle: "demo",
  displayName: "Maya Reyes — Lash & Brow",
  bio: "Studio in Winter Park · booking new clients for August ✨",
  theme: "rosegold",
  blocks: [
    // Real-shaped URLs on purpose: the renderer's allowlist drops
    // anything that isn't http(s)/tel/mailto — "#" placeholders render
    // as nothing at all (found live: an empty demo phone).
    { id: "blk_d1", type: "link", order: 0, data: { label: "Book an appointment", url: "https://book.example.com/maya", icon: "📅" } },
    { id: "blk_d2", type: "link", order: 1, data: { label: "Price list", url: "https://maya.example.com/prices", icon: "💅" } },
    { id: "blk_d3", type: "link", order: 2, data: { label: "Text the studio", url: "tel:+14075550123", icon: "💬" } },
    {
      id: "blk_d4",
      type: "social",
      order: 3,
      data: {
        links: [
          { network: "instagram", url: "https://instagram.com/maya.lash.demo" },
          { network: "tiktok", url: "https://tiktok.com/@maya.lash.demo" },
        ],
      },
    },
    { id: "blk_d5", type: "header", order: 4, data: { text: "Save my card" } },
    { id: "blk_d6", type: "surfaces", order: 5, data: {} },
  ],
  capabilities: [],
  renderers: [],
  status: "published",
  publishedAt: "2026-07-01T12:00:00.000Z",
  createdAt: "2026-07-01T11:00:00.000Z",
  updatedAt: "2026-07-01T12:00:00.000Z",
};

demo.get("/demo", (req, res) => {
  const origin =
    config.publicOrigin || `${req.protocol}://${req.get("host") ?? "localhost"}`;
  res.setHeader("content-type", "text/html; charset=utf-8");
  res.setHeader("cache-control", "public, max-age=300");
  res.send(
    renderProfileHtml(DEMO, {
      origin,
      brand: config.brandName,
      brandLogo: config.brandLogoUrl || undefined,
      favicon: config.faviconUrl || undefined,
      holoColors: config.holoColors.length ? config.holoColors : undefined,
    }),
  );
});

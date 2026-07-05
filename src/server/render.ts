/**
 * Public rendering routes — where the renderer registry meets the road.
 *
 *   GET /:handle            → default renderer (html), 301 on renamed handles
 *   GET /:handle?format=id  → any registered renderer, same URL grammar
 *   GET /go/:id/:blockId    → click-tracked outbound redirect
 *
 * Every view and click lands as an append-only event document. Analytics
 * are one NQL GROUP BY away, and nothing is ever updated or deleted.
 */

import { Router } from "express";

import { COLLECTIONS } from "../lib/identity";
import { getRenderer } from "../lib/registry";
import "../lib/renderers/html";
import "../lib/renderers/json";
import { config } from "./config";
import { db } from "./db";
import { getManifest, resolveHandle } from "./identities";
import { wrap } from "./util";

export const render = Router();

function originOf(req: { protocol: string; get(h: string): string | undefined }): string {
  return config.publicOrigin || `${req.protocol}://${req.get("host") ?? "localhost"}`;
}

/** Append-only, fire-and-forget. A failed analytics write never blocks a render. */
function track(event: Record<string, unknown>): void {
  const id = `evt_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`;
  db.put(COLLECTIONS.events, id, { ...event, ts: new Date().toISOString() }).catch((err) => {
    console.warn(`[links] event write failed: ${err instanceof Error ? err.message : err}`);
  });
}

/** GET /go/:identityId/:blockId?to=… — outbound click tracking. */
render.get("/go/:identityId/:blockId", (req, res) => {
  const to = String(req.query.to ?? "");
  if (!/^(https?:|mailto:|tel:)/i.test(to)) {
    res.status(400).send("bad destination");
    return;
  }
  track({
    identityId: String(req.params.identityId),
    blockId: String(req.params.blockId),
    kind: "link_click",
    source: typeof req.query.src === "string" ? req.query.src : "direct",
  });
  res.redirect(302, to);
});

/** GET /:handle — the public identity, through whichever renderer is asked for. */
render.get("/:handle", wrap(async (req, res, next) => {
  const raw = String(req.params.handle).toLowerCase();
  // Anything with a dot is a file request (favicon.ico etc.) — not a handle.
  if (raw.includes(".")) {
    next();
    return;
  }

  const resolved = await resolveHandle(raw);
  if (!resolved) {
    next();
    return;
  }
  // Renamed handle: send visitors (and old QR codes) to the new branding.
  if (resolved.redirected) {
    const qs = req.originalUrl.includes("?")
      ? req.originalUrl.slice(req.originalUrl.indexOf("?"))
      : "";
    res.redirect(301, `/${resolved.record.handle}${qs}`);
    return;
  }

  const manifest = await getManifest(resolved.record.identityId);
  if (!manifest || manifest.status !== "published") {
    next();
    return;
  }

  const format = typeof req.query.format === "string" ? req.query.format : "html";
  const renderer = getRenderer(format);
  if (!renderer) {
    res.status(400).json({ error: `unknown renderer: ${format}` });
    return;
  }

  track({
    identityId: manifest.identityId,
    kind: "profile_view",
    source: typeof req.query.src === "string" ? req.query.src : "direct",
  });

  const out = await renderer.render(manifest, { origin: originOf(req) });
  res.setHeader("content-type", out.contentType);
  if (out.filename) {
    res.setHeader("content-disposition", `attachment; filename="${out.filename}"`);
  }
  res.send(out.body);
}));

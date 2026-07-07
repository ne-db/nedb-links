/**
 * App assembly — everything except env loading and listening.
 *
 * Exists as a factory so tests can boot the REAL app against a REAL
 * nedbd on an ephemeral port. NEDB Links does not test against mocks;
 * the engine is the system under test as much as the app is.
 */

import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import cors from "cors";
import express, { type Express, type NextFunction, type Request, type Response } from "express";

import { accounts } from "./accounts";
import { accountsEmail } from "./accounts-email";
import { analytics } from "./analytics";
import { billing, mountWebhook } from "./billing";
import { config } from "./config";
import { db } from "./db";
import { grants } from "./grants";
import { handles, identities } from "./identities";
import { preview } from "./preview";
import { discover } from "./discover";
import { render } from "./render";
import { uploads } from "./uploads";

export function createApp(): Express {
  const app = express();

  // ── Request logger ────────────────────────────────────────────────────────
  app.use((req: Request, res: Response, next: NextFunction) => {
    const start = Date.now();
    // req.originalUrl captured now — Express mutates req.url through routers.
    const originalUrl = req.originalUrl || req.url;
    res.on("finish", () => {
      const ms = Date.now() - start;
      const status = res.statusCode;
      const color =
        status >= 500 ? "\x1b[31m" : status >= 400 ? "\x1b[33m" : status >= 300 ? "\x1b[36m" : "\x1b[32m";
      console.log(`${color}${status}\x1b[0m ${req.method} ${originalUrl} — ${ms}ms`);
    });
    next();
  });

  app.use(cors());
  // Stripe webhook needs the raw body for signature verification —
  // mounted before the JSON parser touches anything.
  mountWebhook(app);
  app.use(express.json({ limit: "8mb" }));

  // ── Health — reports every dependency ────────────────────────────────────
  app.get("/api/health", async (_req, res) => {
    let nedb: { ok: boolean; version?: string; error?: string } = { ok: false };
    try {
      const h = await db.health();
      nedb = { ok: h.ok, version: h.version };
    } catch (err) {
      nedb = { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
    res.json({
      links: "ok",
      nedb,
      nedbUrl: config.nedbUrl,
      db: config.nedbDb,
      authConfigured: Boolean(config.adminToken),
      aiassist: { configured: Boolean(config.aiassistApiKey) },
    });
  });

  // ── Public deployment config — the client's mode switch ──────────────────
  app.get("/api/config", (_req, res) => {
    res.json({
      authMode: config.authMode,
      brandName: config.brandName,
      defaultTheme: config.defaultTheme,
      fiatDoor: Boolean(config.stripeSecretKey),
      limitEnabled: config.limitEnabled,
      uploads: Boolean(config.imgbbKey) || process.env.LINKS_UPLOAD_TEST === "1",
    });
  });

  // ── API ───────────────────────────────────────────────────────────────────
  // ONE account system per deployment. The other product's endpoints
  // don't exist here — wallet routes 404 on ne-db.com and vice versa.
  app.use("/api/auth", config.authMode === "email" ? accountsEmail : accounts);
  app.use("/api/billing", billing);
  app.use("/api/handles", handles);
  app.use("/api/identities/:id/analytics", analytics);
  app.use("/api/identities/:id/grants", grants);
  app.use("/api/identities", identities);
  app.use("/api/preview", preview);
  app.use("/api/upload", uploads);

  // ── Editor SPA (production build) ─────────────────────────────────────────
  const dist = resolve(process.cwd(), "dist");
  const hasDist = existsSync(join(dist, "index.html"));
  // Runtime brand injection: ONE build serves every deployment, so the
  // shell learns its identity when served, not when built. The injected
  // blob feeds the pre-paint theme script and the document title.
  const shellHtml = hasDist
    ? readFileSync(join(dist, "index.html"), "utf8").replace(
        "<head>",
        `<head><script>window.__LINKS_CONFIG__=${JSON.stringify({
          brandName: config.brandName,
          defaultTheme: config.defaultTheme,
          authMode: config.authMode,
        })}</script>`,
      )
    : null;
  const sendShell = (res: Response): void => {
    res.setHeader("content-type", "text/html; charset=utf-8");
    res.send(shellHtml);
  };
  if (hasDist) {
    app.get(["/", "/index.html"], (_req, res) => sendShell(res));
    app.use(express.static(dist, { index: false }));
  }

  // ── Public identity surfaces (/:handle, /go/*) ────────────────────────────
  // Discover mounts BEFORE /:handle so the directory wins the route.
  app.use(discover);
  app.use(render);

  // ── SPA fallback ──────────────────────────────────────────────────────────
  app.get("*", (req: Request, res: Response) => {
    if (req.path.startsWith("/api/")) {
      res.status(404).json({ error: "not found" });
      return;
    }
    if (hasDist) {
      sendShell(res);
      return;
    }
    res
      .status(503)
      .send("NEDB Links: no production build found. Run `npm run build`, or use `npm run dev`.");
  });

  return app;
}

/** Idempotent database bootstrap — see server.ts for the interop story. */
export async function ensureDatabase(): Promise<void> {
  try {
    await db.createDatabase();
    console.log(`\x1b[36m⬡\x1b[0m database ready: ${config.nedbDb}`);
  } catch (err) {
    console.warn(
      `\x1b[33m[links] could not ensure database (${err instanceof Error ? err.message : err}) — is nedbd running at ${config.nedbUrl}?\x1b[0m`,
    );
  }
}

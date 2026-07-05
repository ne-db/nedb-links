/**
 * NEDB Links — Express server.
 *
 * NEDB stores knowledge. Portal renders experiences. Links publishes identity.
 *
 * This process does three jobs:
 *   1. /api/*  — the write/read API over nedbd (through nedb-engine-client)
 *   2. /:handle and /go/* — public server-rendered identity surfaces
 *   3. dist/   — the editor SPA, in production
 */

import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";

/** Minimal .env loader (no dependency). Real env always wins. */
function loadEnv(): void {
  const path = resolve(process.cwd(), ".env");
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
}
loadEnv();

const { config } = await import("./src/server/config");
const { db } = await import("./src/server/db");
const { handles, identities } = await import("./src/server/identities");
const { render } = await import("./src/server/render");
const { warnIfOpen } = await import("./src/server/auth");

const app = express();

// ── Request logger ──────────────────────────────────────────────────────────
app.use((req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();
  // req.originalUrl is captured because Express mutates req.url while routing
  // through mounted sub-routers — by "finish" time req.url is router-relative.
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
app.use(express.json({ limit: "8mb" }));

// ── Health — reports every dependency, so wiring issues diagnose themselves ──
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

// ── API ──────────────────────────────────────────────────────────────────────
app.use("/api/handles", handles);
app.use("/api/identities", identities);

// ── Editor SPA (production build) ────────────────────────────────────────────
const dist = resolve(process.cwd(), "dist");
const hasDist = existsSync(join(dist, "index.html"));
if (hasDist) {
  app.use(express.static(dist, { index: false }));
}

// ── Public identity surfaces (/:handle, /go/*) ───────────────────────────────
app.use(render);

// ── SPA fallback ─────────────────────────────────────────────────────────────
app.get("*", (req: Request, res: Response) => {
  if (req.path.startsWith("/api/")) {
    res.status(404).json({ error: "not found" });
    return;
  }
  if (hasDist) {
    res.sendFile(join(dist, "index.html"));
    return;
  }
  res
    .status(503)
    .send("NEDB Links: no production build found. Run `npm run build`, or use `npm run dev`.");
});

// Ensure the database exists BEFORE the first write. Idempotent.
// Works around a nedbd 2.6.1 interop bug found in Links' first smoke test:
// on an unknown-db 404 the daemon responds without draining the request
// body, so the client's auto-create retry on the same keep-alive socket
// gets misparsed ("Bad request syntax"). Creating the db up front keeps
// every write on the happy path. Proper fix lands engine-side.
try {
  await db.createDatabase();
  console.log(`\x1b[36m⬡\x1b[0m database ready: ${config.nedbDb}`);
} catch (err) {
  console.warn(
    `\x1b[33m[links] could not ensure database (${err instanceof Error ? err.message : err}) — is nedbd running at ${config.nedbUrl}?\x1b[0m`,
  );
}

app.listen(config.port, () => {
  console.log(`\x1b[36m⬡ NEDB Links\x1b[0m listening on :${config.port}`);
  console.log(`  nedbd → ${config.nedbUrl} (db: ${config.nedbDb})`);
  warnIfOpen();
});

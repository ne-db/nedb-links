import type { NextFunction, Request, Response } from "express";
import { config } from "./config";

/**
 * v0.1 auth: one admin token gates the editor and every write.
 * Set LINKS_ADMIN_TOKEN in production. When unset, writes are open —
 * a loud warning is printed at boot (dev convenience only).
 *
 * Multi-owner auth is on the living backlog; the data model is already
 * shaped for it (IdentityManifest.owner).
 */
export function requireAdmin(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (!config.adminToken) {
    next();
    return;
  }
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (token !== config.adminToken) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  next();
}

export function warnIfOpen(): void {
  if (!config.adminToken) {
    console.warn(
      "\x1b[33m[links] LINKS_ADMIN_TOKEN is not set — the editor and write API are OPEN. Set it before exposing this instance.\x1b[0m",
    );
  }
}

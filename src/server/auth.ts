/**
 * Request authentication.
 *
 * Two credentials pass the same Bearer header:
 *   - a session token (from POST /api/auth/verify — wallet login)
 *   - the operator token (LINKS_ADMIN_TOKEN — the instance runner's
 *     override for ops and migration; bypasses role checks)
 *
 * requireUser resolves the caller into res.locals.auth:
 *   { address: "itc1…", isOperator: false }   — wallet user
 *   { address: "operator", isOperator: true } — instance operator
 */

import type { NextFunction, Request, Response } from "express";

import { COLLECTIONS, type SessionRecord } from "../lib/identity";
import { sha256Hex } from "../lib/wallet";
import { config } from "./config";
import { db } from "./db";

export interface AuthContext {
  address: string;
  isOperator: boolean;
}

export function authOf(res: Response): AuthContext | null {
  return (res.locals.auth as AuthContext | undefined) ?? null;
}

async function resolveAuth(req: Request): Promise<AuthContext | null> {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return null;

  if (config.adminToken && token === config.adminToken) {
    return { address: "operator", isOperator: true };
  }

  const doc = await db.get(COLLECTIONS.sessions, sha256Hex(token));
  const session = doc as unknown as SessionRecord | null;
  if (!session) return null;
  if (new Date(session.expiresAt).getTime() < Date.now()) return null;
  return { address: session.address, isOperator: false };
}

/** Gate: any authenticated caller (wallet session or operator). */
export function requireUser(req: Request, res: Response, next: NextFunction): void {
  resolveAuth(req)
    .then((auth) => {
      if (!auth) {
        res.status(401).json({ error: "unauthorized" });
        return;
      }
      res.locals.auth = auth;
      next();
    })
    .catch((err) => {
      console.error(`[links] auth resolution failed: ${err instanceof Error ? err.message : err}`);
      res.status(502).json({ error: "engine unavailable" });
    });
}

/** Gate: instance operator only. */
export function requireOperator(req: Request, res: Response, next: NextFunction): void {
  resolveAuth(req)
    .then((auth) => {
      if (!auth?.isOperator) {
        res.status(401).json({ error: "operator token required" });
        return;
      }
      res.locals.auth = auth;
      next();
    })
    .catch(() => res.status(502).json({ error: "engine unavailable" }));
}

export function warnIfOpen(): void {
  if (!config.adminToken) {
    console.warn(
      "\x1b[33m[links] LINKS_ADMIN_TOKEN is not set — operator override disabled. Users authenticate with seed-phrase wallets.\x1b[0m",
    );
  }
}

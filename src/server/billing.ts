/**
 * Monetization — the anti-Linktree model.
 *
 *   Free: one profile per account, forever.
 *   Unlimited, two doors:
 *     - pay what you want, ONCE (Stripe; floor $1) — no subscriptions,
 *       no rent. The receipt is an entitlement document in the engine,
 *       provenance and all.
 *     - hold ≥ LINKS_ITC_THRESHOLD ITC on your account address —
 *       ownership was proven by the login signature, so the check is
 *       one ElectrumX query. Hold the coin, never pay the fee.
 *
 * Self-hosters who configure neither Stripe nor a limit run unlimited
 * free. Monetize the hosted instance; never the GPLv3 code.
 */

import { Router, raw, type Express } from "express";
import Stripe from "stripe";
import { z } from "zod";

import { COLLECTIONS } from "../lib/identity";
import { authOf, requireUser, type AuthContext } from "./auth";
import { config } from "./config";
import { db } from "./db";
import { confirmedItcBalance } from "./electrum";
import { grantsOf } from "./grants";
import { wrap } from "./util";

export const billing = Router();

const stripe = config.stripeSecretKey ? new Stripe(config.stripeSecretKey) : null;

export interface EntitlementRecord {
  address: string;
  kind: "supporter";
  amountCents: number;
  currency: string;
  stripeSessionId: string;
  createdAt: string;
}

export async function getEntitlement(
  address: string,
): Promise<EntitlementRecord | null> {
  const doc = await db.get(COLLECTIONS.entitlements, address);
  return (doc as EntitlementRecord | null) ?? null;
}

export async function ownedProfileCount(address: string): Promise<number> {
  const grants = await grantsOf(address);
  return grants.filter((g) => g.role === "owner").length;
}

export interface UnlimitedStatus {
  unlimited: boolean;
  via: "operator" | "supporter" | "holder" | "unlimited-instance" | "none";
}

export async function unlimitedStatus(auth: AuthContext): Promise<UnlimitedStatus> {
  if (!config.limitEnabled) return { unlimited: true, via: "unlimited-instance" };
  if (auth.isOperator) return { unlimited: true, via: "operator" };
  if (await getEntitlement(auth.address)) return { unlimited: true, via: "supporter" };
  const itc = await confirmedItcBalance(auth.address);
  if (itc !== null && itc >= config.itcThreshold) {
    return { unlimited: true, via: "holder" };
  }
  return { unlimited: false, via: "none" };
}

/** The claim gate: may this account create one more profile? */
export async function canClaimAnother(auth: AuthContext): Promise<boolean> {
  if (!config.limitEnabled || auth.isOperator) return true;
  const owned = await ownedProfileCount(auth.address);
  if (owned < config.freeProfileLimit) return true;
  return (await unlimitedStatus(auth)).unlimited;
}

// ── Routes ───────────────────────────────────────────────────────────────────

/** GET /api/billing/status — everything the upgrade UI needs. */
billing.get("/status", requireUser, wrap(async (_req, res) => {
  const auth = authOf(res);
  if (!auth) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  const [owned, status, itc] = await Promise.all([
    config.limitEnabled ? ownedProfileCount(auth.address) : Promise.resolve(0),
    unlimitedStatus(auth),
    config.limitEnabled ? confirmedItcBalance(auth.address) : Promise.resolve(null),
  ]);
  res.json({
    limitEnabled: config.limitEnabled,
    freeLimit: config.freeProfileLimit,
    owned,
    unlimited: status.unlimited,
    via: status.via,
    itcThreshold: config.itcThreshold,
    itcBalance: itc,
    holderCheckAvailable: itc !== null,
    fiatDoor: Boolean(stripe),
    pwywMinCents: config.pwywMinCents,
    address: auth.isOperator ? null : auth.address,
  });
}));

/** POST /api/billing/checkout { amountCents } — pay what you want, once. */
billing.post("/checkout", requireUser, wrap(async (req, res) => {
  const auth = authOf(res);
  if (!auth || auth.isOperator) {
    res.status(400).json({ error: "wallet account required" });
    return;
  }
  if (!stripe) {
    res.status(503).json({ error: "payments are not configured on this instance" });
    return;
  }
  const body = z
    .object({ amountCents: z.number().int().min(config.pwywMinCents).max(50_000) })
    .safeParse(req.body);
  if (!body.success) {
    res.status(400).json({
      error: `amount must be between ${config.pwywMinCents} and 50000 cents`,
    });
    return;
  }
  const origin = `${req.protocol}://${req.get("host") ?? "localhost"}`;
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: body.data.amountCents,
          product_data: {
            name: "NEDB Links — unlimited profiles, forever",
            description: "Pay what you want, once. No subscription.",
          },
        },
      },
    ],
    metadata: { address: auth.address },
    success_url: `${origin}/identities?upgraded=1`,
    cancel_url: `${origin}/identities`,
  });
  res.json({ url: session.url });
}));

/**
 * Stripe webhook — mounted with a RAW body BEFORE express.json()
 * (signature verification needs the exact bytes). See mountWebhook.
 */
export function mountWebhook(app: Express): void {
  app.post(
    "/api/billing/webhook",
    raw({ type: "application/json" }),
    (req, res) => {
      void (async () => {
        if (!stripe || !config.stripeWebhookSecret) {
          res.status(503).json({ error: "webhook not configured" });
          return;
        }
        let event: Stripe.Event;
        try {
          event = stripe.webhooks.constructEvent(
            req.body as Buffer,
            req.headers["stripe-signature"] as string,
            config.stripeWebhookSecret,
          );
        } catch (err) {
          res.status(400).json({
            error: `signature verification failed: ${err instanceof Error ? err.message : err}`,
          });
          return;
        }

        if (event.type === "checkout.session.completed") {
          const session = event.data.object;
          const address = session.metadata?.address;
          if (address) {
            const record: EntitlementRecord = {
              address,
              kind: "supporter",
              amountCents: session.amount_total ?? 0,
              currency: session.currency ?? "usd",
              stripeSessionId: session.id,
              createdAt: new Date().toISOString(),
            };
            await db.put(
              COLLECTIONS.entitlements,
              address,
              record as unknown as Record<string, unknown>,
              { evidence: `pay-what-you-want supporter: ${session.id}` },
            );
            console.log(`[links] supporter entitlement written for ${address}`);
          }
        }
        res.json({ received: true });
      })().catch((err) => {
        console.error(`[links] webhook handling failed: ${err instanceof Error ? err.message : err}`);
        if (!res.headersSent) res.status(500).json({ error: "webhook processing failed" });
      });
    },
  );
}

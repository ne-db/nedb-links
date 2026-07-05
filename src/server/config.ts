/** Server configuration — real env always wins over .env (loaded in server.ts). */

export interface LinksConfig {
  /** Express port. */
  port: number;
  /** Running nedbd instance. All state lives there. */
  nedbUrl: string;
  /** Database name inside nedbd. */
  nedbDb: string;
  /** Bearer token for nedbd, when the daemon is token-gated. */
  nedbToken?: string;
  /** v0.1 single-owner auth: token gating the editor and every write. */
  adminToken?: string;
  /** Public origin for share URLs and QR payloads. */
  publicOrigin?: string;
  /** AiAS gateway for the AI Profile Assistant (optional). */
  aiassistBaseUrl: string;
  aiassistApiKey?: string;

  // ── Monetization ────────────────────────────────────────────────────────
  /** Profile limits active? On when Stripe is configured or the limit is
   *  set explicitly. Self-host default: unlimited free. */
  limitEnabled: boolean;
  /** Free profiles per account (default 1 when limits are on). */
  freeProfileLimit: number;
  /** Stripe (pay-what-you-want, one time). Absent = fiat door closed. */
  stripeSecretKey?: string;
  stripeWebhookSecret?: string;
  /** PWYW floor in cents (default 100 = one dollar). */
  pwywMinCents: number;
  /** Hold-ITC door: threshold in whole ITC (default 100). */
  itcThreshold: number;
  /** ElectrumX for balance checks — Interchained fleet by default. */
  electrumHost: string;
  electrumPort: number;
  electrumTls: boolean;
}

export function loadConfig(): LinksConfig {
  return {
    port: Number(process.env.PORT || 3001),
    nedbUrl: process.env.NEDB_URL || "http://127.0.0.1:7070",
    nedbDb: process.env.NEDB_DB || "links",
    nedbToken: process.env.NEDB_TOKEN || undefined,
    adminToken: process.env.LINKS_ADMIN_TOKEN || undefined,
    publicOrigin: process.env.PUBLIC_ORIGIN || undefined,
    aiassistBaseUrl: process.env.AIASSIST_BASE_URL || "https://api.aiassist.net",
    aiassistApiKey: process.env.AIASSIST_API_KEY || undefined,

    // Limits activate when Stripe is configured or the limit is set
    // explicitly. Self-hosters who configure neither run unlimited free.
    limitEnabled:
      Boolean(process.env.STRIPE_SECRET_KEY) ||
      process.env.LINKS_FREE_PROFILE_LIMIT !== undefined,
    freeProfileLimit: Math.max(1, Number(process.env.LINKS_FREE_PROFILE_LIMIT || 1)),
    stripeSecretKey: process.env.STRIPE_SECRET_KEY || undefined,
    stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET || undefined,
    pwywMinCents: Math.max(50, Number(process.env.LINKS_PWYW_MIN_CENTS || 100)),
    itcThreshold: Math.max(1, Number(process.env.LINKS_ITC_THRESHOLD || 100)),
    electrumHost: process.env.ELECTRUMX_HOST || "seed.interchained.org",
    electrumPort: Number(process.env.ELECTRUMX_PORT || 50002),
    electrumTls: process.env.ELECTRUMX_TLS !== "0",
  };
}

export const config = loadConfig();

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
  };
}

export const config = loadConfig();

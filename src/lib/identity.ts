/**
 * Identity Manifest — the canonical contract of NEDB Links.
 *
 * The manifest is the product. Every surface (profile page, business card,
 * QR payload, vCard, JSON API, PDF, email signature, future NFC) is a
 * renderer over this one structure. Renderers come and go; the manifest
 * is permanence.
 *
 * Two identifiers, two jobs (never conflate them):
 *   - identityId: immutable. The NEDB document id. Permanence — provenance,
 *     history, backlinks, and printed QR codes hang off this.
 *   - handle: branding. A mutable, unique, human-claimed name that maps to an
 *     identityId. Renames leave a redirect so nothing ever breaks.
 *
 * A user OWNS identities (plural). Personal, business, brand, conference,
 *  anonymous demo — one owner, many identities. Identity is not the user.
 */

export const SCHEMA_VERSION = 1 as const;

/** Capabilities a block advertises so renderers can reason generically. */
export const CAPABILITIES = [
  "shareable",
  "qr",
  "printable",
  "searchable",
  "exportable",
  "embeddable",
  "schedulable",
  "interactive",
  "seo",
] as const;

export type Capability = (typeof CAPABILITIES)[number];

export type IdentityType =
  | "personal"
  | "business"
  | "organization"
  | "project"
  | "event"
  | "demo";

export type IdentityStatus = "draft" | "published";

/** A block INSTANCE inside a manifest. Its shape is governed by the
 *  BlockDefinition registered for `type` (see registry.ts). */
export interface Block {
  /** Stable id within the manifest (blk_*). */
  id: string;
  /** Registered block type: link, header, social, embed, ... */
  type: string;
  /** Explicit ordering — the manifest owns block order. */
  order: number;
  /** Block payload, validated by the block definition's schema. */
  data: Record<string, unknown>;
}

/** The canonical object every renderer understands. */
export interface IdentityManifest {
  schemaVersion: typeof SCHEMA_VERSION;
  /** Immutable id — also the NEDB document id in the identities collection. */
  identityId: string;
  identityType: IdentityType;
  /** Owner reference. v0.1 self-host: the admin owner string. */
  owner: string;
  /** Current branded handle (denormalized from the handles collection). */
  handle: string;
  displayName: string;
  bio?: string;
  /** Avatar URL or data URI. */
  avatar?: string;
  /** Template that seeded this identity (who-are-you vertical). */
  template?: string;
  /** Theme id understood by HTML renderers. */
  theme?: string;
  /** Ordered blocks — the body of the identity. */
  blocks: Block[];
  /** Aggregate capabilities advertised by this identity's blocks. */
  capabilities: Capability[];
  /** Renderer ids this identity opts into (empty = all registered). */
  renderers: string[];
  status: IdentityStatus;
  publishedAt?: string;
  createdAt: string;
  updatedAt: string;
}

/** Handle document — id in the handles collection IS the handle string. */
export interface HandleRecord {
  handle: string;
  identityId: string;
  /** active = current branding; redirect = renamed away, 301 to successor. */
  status: "active" | "redirect";
  /** When status is redirect: the handle to send visitors to. */
  redirectTo?: string;
  claimedAt: string;
}

/** Append-only analytics event. Never updated, never deleted. */
export interface LinkEvent {
  identityId: string;
  blockId?: string;
  kind: "profile_view" | "link_click" | "qr_scan" | "vcard_download";
  /** Traffic source tag (qr, direct, social, ...). QR codes mint URLs with
   *  a source tag so scans are distinguishable from taps — analytics answer
   *  "salon counter vs Instagram bio" with one NQL GROUP BY. */
  source?: string;
  ts: string;
}

export const HANDLE_RE = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])?$/;

/** Route names the app owns — never claimable as handles. */
export const RESERVED_HANDLES = new Set([
  "api", "go", "edit", "new", "claim", "admin", "app", "assets", "static",
  "health", "docs", "about", "settings", "login", "logout", "favicon",
  "robots", "sitemap", "index", "links", "nedb",
]);

/** Handles are lowercase, 2-40 chars, alphanumeric plus inner hyphens. */
export function isValidHandle(handle: string): boolean {
  return HANDLE_RE.test(handle) && !RESERVED_HANDLES.has(handle);
}

/**
 * A URL that actually points somewhere. Template-seeded blocks carry the
 * placeholder "https://" so users see where links belong — placeholders
 * are valid to SAVE (drafting never fights you) but renderers skip them,
 * so an unfilled link never appears on a public surface.
 */
export function isFilledUrl(u: unknown): boolean {
  return typeof u === "string" && /^(https?:\/\/\S+|mailto:\S+|tel:\S+)$/.test(u);
}

/** Valid as a stored value: empty, the placeholder, or a real URL. */
export function isStorableUrl(u: unknown): boolean {
  return u === "" || u === "https://" || u === "http://" || isFilledUrl(u);
}

export function newIdentityId(): string {
  return `idn_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`;
}

export function newBlockId(): string {
  return `blk_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
}

// ── Accounts, sessions, RBAC ─────────────────────────────────────────────────

/** Roles, weakest to strongest. Blockchain-simple: shared by address. */
export const ROLES = ["viewer", "editor", "owner"] as const;
export type Role = (typeof ROLES)[number];

export function roleRank(role: Role): number {
  return ROLES.indexOf(role);
}

/** Access grant — id is `${identityId}:${address}`. caused_by chains
 *  grants to the granter's own grant: TRACE walks the authority chain. */
export interface GrantRecord {
  identityId: string;
  /** itc1… address of the grantee. */
  address: string;
  role: Role;
  /** Address that granted this (or "operator"). */
  grantedBy: string;
  createdAt: string;
}

/** Login challenge — short-lived, single-use. */
export interface ChallengeRecord {
  challengeId: string;
  address: string;
  nonce: string;
  createdAt: string;
  expiresAt: string;
}

/** Session — id is sha256(token); the raw token is never stored. */
export interface SessionRecord {
  tokenHash: string;
  address: string;
  createdAt: string;
  expiresAt: string;
}

/** Collections — the entire storage footprint of NEDB Links. */
export const COLLECTIONS = {
  identities: "identities",
  handles: "handles",
  events: "events",
  challenges: "challenges",
  sessions: "sessions",
  grants: "grants",
} as const;

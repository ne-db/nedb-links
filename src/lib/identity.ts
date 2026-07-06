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

/** MySpace energy, Links safety: a structured five-color palette the
 *  owner edits inline. Validated hex only — never raw CSS. */
export interface CustomPalette {
  bg: string;
  card: string;
  text: string;
  sub: string;
  accent: string;
  /** Curated font picks — ids into FONTS, never raw strings. */
  headingFont?: FontId;
  bodyFont?: FontId;
}

export const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

/**
 * Curated font choices — the enum IS the input; CSS stacks and Google
 * Fonts params come from THIS map only, never from user strings.
 * Ten registers, from boardroom to MySpace chaos.
 */
export const FONTS = {
  system:         { label: "System (clean)",        css: "system-ui, -apple-system, 'Segoe UI', sans-serif", google: null },
  inter:          { label: "Inter (modern)",        css: "'Inter', system-ui, sans-serif",            google: "Inter:wght@400;600;800" },
  "space-grotesk":{ label: "Space Grotesk (tech)",  css: "'Space Grotesk', system-ui, sans-serif",    google: "Space+Grotesk:wght@400;600;700" },
  poppins:        { label: "Poppins (friendly)",    css: "'Poppins', system-ui, sans-serif",          google: "Poppins:wght@400;600;700" },
  montserrat:     { label: "Montserrat (bold)",     css: "'Montserrat', system-ui, sans-serif",       google: "Montserrat:wght@400;600;800" },
  playfair:       { label: "Playfair (elegant)",    css: "'Playfair Display', Georgia, serif",        google: "Playfair+Display:wght@400;700" },
  lora:           { label: "Lora (literary)",       css: "'Lora', Georgia, serif",                    google: "Lora:wght@400;600" },
  "dm-serif":     { label: "DM Serif (editorial)",  css: "'DM Serif Display', Georgia, serif",        google: "DM+Serif+Display" },
  "jetbrains-mono":{ label: "JetBrains Mono (dev)", css: "'JetBrains Mono', ui-monospace, monospace", google: "JetBrains+Mono:wght@400;600" },
  caveat:         { label: "Caveat (handwritten)",  css: "'Caveat', cursive",                         google: "Caveat:wght@500;700" },
} as const;

export type FontId = keyof typeof FONTS;
export const FONT_IDS = Object.keys(FONTS) as [FontId, ...FontId[]];

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
  /** Owner-customized palette — overrides theme when present. */
  themeCustom?: CustomPalette;
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
  "robots", "sitemap", "index", "links", "nedb", "analytics", "identities",
  "verify", "reset",
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
  /** Grantee principal: itc1… (wallet mode) or eml_… (email mode). */
  address: string;
  role: Role;
  /** Principal that granted this (or "operator"). */
  grantedBy: string;
  createdAt: string;
  /** Email mode: the human-readable identity behind the eml_ principal
   *  (display only — RBAC keys on the principal). */
  email?: string;
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
  entitlements: "entitlements",
  accounts: "accounts",
} as const;

/**
 * Email-mode account (LINKS_AUTH_MODE=email — the ne-db.com product).
 * Doc id = principal (`eml_` + sha256(email)[:20]) — the same opaque
 * string that rides sessions, grants, and entitlements, so RBAC and
 * billing never learned a new trick. Wallet mode never reads this
 * collection; email mode never sees a seed phrase.
 */
export interface AccountRecord {
  principal: string;
  email: string;
  /** scrypt$N$r$p$salt_b64$key_b64 — params recorded for future upgrades. */
  passwordHash: string;
  createdAt: string;
  verifiedAt?: string;
}

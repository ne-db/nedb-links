/**
 * Identity + handle API. Thin routes: validate, then let the engine be
 * the source of truth. Every mutation chains caused_by provenance, so
 * TRACE reconstructs an identity's full edit history and AS OF replays
 * any moment of it.
 */

import { Router } from "express";
import { z } from "zod";

import {
  COLLECTIONS,
  isValidHandle,
  newIdentityId,
  SCHEMA_VERSION,
  type Block,
  type HandleRecord,
  type IdentityManifest,
} from "../lib/identity";
import { getBlock, getTemplate, manifestCapabilities } from "../lib/registry";
import "../lib/blocks/builtin";
import "../lib/templates/builtin";
import { requireAdmin } from "./auth";
import { wrap } from "./util";
import { causalParent, db } from "./db";

export const identities = Router();
export const handles = Router();

// ── Validation ───────────────────────────────────────────────────────────────

const blockSchema = z.object({
  id: z.string().min(1).max(40),
  type: z.string().min(1).max(40),
  order: z.number().int().min(0),
  data: z.record(z.unknown()),
});

const manifestPatchSchema = z.object({
  displayName: z.string().min(1).max(120).optional(),
  bio: z.string().max(600).optional(),
  avatar: z.string().max(200_000).optional(),
  theme: z.string().max(40).optional(),
  blocks: z.array(blockSchema).max(200).optional(),
});

/** Validate each block's payload against its registered definition. */
function validateBlocks(blocks: Block[]): string | null {
  for (const b of blocks) {
    const def = getBlock(b.type);
    if (!def) return `unknown block type: ${b.type}`;
    const result = def.schema.safeParse(b.data);
    if (!result.success) {
      return `block ${b.id} (${b.type}): ${result.error.issues[0]?.message ?? "invalid"}`;
    }
  }
  return null;
}

async function getHandleRecord(handle: string): Promise<HandleRecord | null> {
  const doc = await db.get(COLLECTIONS.handles, handle);
  return doc ? (doc as unknown as HandleRecord) : null;
}

export async function resolveHandle(
  handle: string,
): Promise<{ record: HandleRecord; redirected: boolean } | null> {
  const record = await getHandleRecord(handle);
  if (!record) return null;
  if (record.status === "redirect" && record.redirectTo) {
    const target = await getHandleRecord(record.redirectTo);
    if (target) return { record: target, redirected: true };
    return null;
  }
  return { record, redirected: false };
}

export async function getManifest(
  identityId: string,
): Promise<IdentityManifest | null> {
  const doc = await db.get(COLLECTIONS.identities, identityId);
  return doc ? (doc as unknown as IdentityManifest) : null;
}

// ── Routes ───────────────────────────────────────────────────────────────────

/** GET /api/handles/:handle/availability — the claim experience begins here. */
handles.get("/:handle/availability", wrap(async (req, res) => {
  const handle = String(req.params.handle).toLowerCase();
  if (!isValidHandle(handle)) {
    res.json({ handle, available: false, reason: "invalid" });
    return;
  }
  const existing = await getHandleRecord(handle);
  res.json({ handle, available: !existing });
}));

/** POST /api/identities — claim a handle, seed from a template, own it. */
identities.post("/", requireAdmin, wrap(async (req, res) => {
  const body = z
    .object({
      handle: z.string(),
      displayName: z.string().min(1).max(120),
      template: z.string().max(40).optional(),
      identityType: z
        .enum(["personal", "business", "organization", "project", "event", "demo"])
        .optional(),
    })
    .safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.issues[0]?.message ?? "invalid body" });
    return;
  }

  const handle = body.data.handle.toLowerCase();
  if (!isValidHandle(handle)) {
    res.status(400).json({ error: "invalid handle" });
    return;
  }
  if (await getHandleRecord(handle)) {
    res.status(409).json({ error: "handle taken" });
    return;
  }

  const identityId = newIdentityId();
  const now = new Date().toISOString();

  const template = body.data.template ? getTemplate(body.data.template) : undefined;
  const seeded = template
    ? template.seed({ handle, displayName: body.data.displayName })
    : { blocks: [] as Block[], identityType: body.data.identityType ?? ("personal" as const) };

  const manifest: IdentityManifest = {
    schemaVersion: SCHEMA_VERSION,
    identityId,
    identityType: seeded.identityType,
    owner: "admin",
    handle,
    displayName: body.data.displayName,
    bio: seeded.bio,
    template: template?.id,
    theme: seeded.theme ?? "midnight",
    blocks: seeded.blocks,
    capabilities: manifestCapabilities(seeded.blocks),
    renderers: [],
    status: "draft",
    createdAt: now,
    updatedAt: now,
  };

  // Claim = write the handle mapping, then the identity, then VERIFY the
  // claim by reading the mapping back. Two concurrent claimers can both
  // pass the availability check; the read-back tells the loser the truth.
  const handleRecord: HandleRecord = {
    handle,
    identityId,
    status: "active",
    claimedAt: now,
  };
  await db.put(COLLECTIONS.handles, handle, handleRecord as unknown as Record<string, unknown>, {
    idem: `claim:${handle}:${identityId}`,
    evidence: `handle claim: ${handle}`,
  });

  const readBack = await getHandleRecord(handle);
  if (!readBack || readBack.identityId !== identityId) {
    res.status(409).json({ error: "handle taken" });
    return;
  }

  const put = await db.put(
    COLLECTIONS.identities,
    identityId,
    manifest as unknown as Record<string, unknown>,
    { evidence: `identity created for handle ${handle}` },
  );

  // Respond with the manifest THIS server constructed — never the engine's
  // put echo, whose shape can vary across nedbd versions. The API response
  // is our contract. (Found live by Mark: an older daemon's echo lacked
  // identityId/handle, rendering an empty claim card.)
  res.status(201).json({ manifest, seq: put.seq, head: put.head });
}));

/** GET /api/identities — every identity this instance owns, newest first.
 *  Summaries only; the editor loads full manifests by id. */
identities.get("/", requireAdmin, wrap(async (_req, res) => {
  const rows = await db.query(
    `FROM ${COLLECTIONS.identities} ORDER BY updatedAt DESC LIMIT 500`,
  );
  const list = (rows as unknown as IdentityManifest[]).map((m) => ({
    identityId: m.identityId,
    handle: m.handle,
    displayName: m.displayName,
    identityType: m.identityType,
    template: m.template,
    theme: m.theme,
    status: m.status,
    blockCount: Array.isArray(m.blocks) ? m.blocks.length : 0,
    publishedAt: m.publishedAt,
    updatedAt: m.updatedAt,
  }));
  res.json({ identities: list });
}));

/** GET /api/identities/:id — the manifest, straight from the engine. */
identities.get("/:id", wrap(async (req, res) => {
  const manifest = await getManifest(String(req.params.id));
  if (!manifest) {
    res.status(404).json({ error: "not found" });
    return;
  }
  res.json({ manifest });
}));

/** PUT /api/identities/:id — save the manifest (draft edits).
 *  Full-manifest replacement with caused_by chaining to the prior version. */
identities.put("/:id", requireAdmin, wrap(async (req, res) => {
  const identityId = String(req.params.id);
  const current = await getManifest(identityId);
  if (!current) {
    res.status(404).json({ error: "not found" });
    return;
  }

  const patch = manifestPatchSchema.safeParse(req.body);
  if (!patch.success) {
    res.status(400).json({ error: patch.error.issues[0]?.message ?? "invalid body" });
    return;
  }

  const blocks = (patch.data.blocks ?? current.blocks) as Block[];
  const blockError = validateBlocks(blocks);
  if (blockError) {
    res.status(400).json({ error: blockError });
    return;
  }

  const next: IdentityManifest = {
    ...current,
    ...patch.data,
    blocks,
    capabilities: manifestCapabilities(blocks),
    updatedAt: new Date().toISOString(),
  };

  const put = await db.put(
    COLLECTIONS.identities,
    identityId,
    next as unknown as Record<string, unknown>,
    {
      causedBy: causalParent(current as unknown as Record<string, unknown>),
      evidence: "manifest edit",
    },
  );
  res.json({ manifest: next, seq: put.seq, head: put.head });
}));

/** POST /api/identities/:id/publish — flip draft to published.
 *  TRACE from this write walks the exact edits that went into it. */
identities.post("/:id/publish", requireAdmin, wrap(async (req, res) => {
  const identityId = String(req.params.id);
  const current = await getManifest(identityId);
  if (!current) {
    res.status(404).json({ error: "not found" });
    return;
  }

  const now = new Date().toISOString();
  const next: IdentityManifest = {
    ...current,
    status: "published",
    publishedAt: now,
    updatedAt: now,
  };
  const put = await db.put(
    COLLECTIONS.identities,
    identityId,
    next as unknown as Record<string, unknown>,
    {
      causedBy: causalParent(current as unknown as Record<string, unknown>),
      evidence: `publish: ${current.handle}`,
    },
  );
  res.json({ manifest: next, seq: put.seq, head: put.head });
}));

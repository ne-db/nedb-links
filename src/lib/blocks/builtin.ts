/**
 * Built-in block types.
 *
 * These register through the same defineBlock() API any third-party
 * developer uses — the Extension Promise, kept from commit one.
 */

import { z } from "zod";
import { isStorableUrl } from "../identity";
import { defineBlock } from "../registry";

/** Real URL or a placeholder — drafts save freely; renderers skip unfilled. */
const storableUrl = z
  .string()
  .max(2048)
  .refine(isStorableUrl, "Invalid url");

export const linkBlock = defineBlock({
  type: "link",
  name: "Link",
  description: "A destination: URL, label, optional icon. The atom of Links.",
  capabilities: ["shareable", "qr", "searchable", "exportable", "schedulable", "seo"],
  schema: z.object({
    label: z.string().min(1).max(120),
    url: storableUrl,
    icon: z.string().max(64).optional(),
  }),
  defaults: () => ({ label: "New link", url: "https://", icon: "" }),
});

export const headerBlock = defineBlock({
  type: "header",
  name: "Header",
  description: "A section heading that groups the blocks beneath it.",
  capabilities: ["printable", "searchable", "seo"],
  schema: z.object({
    text: z.string().min(1).max(120),
  }),
  defaults: () => ({ text: "Section" }),
});

export const socialBlock = defineBlock({
  type: "social",
  name: "Social row",
  description: "Icon row of social destinations rendered compactly.",
  capabilities: ["shareable", "printable", "exportable", "seo"],
  schema: z.object({
    links: z
      .array(
        z.object({
          network: z.string().min(1).max(40),
          url: storableUrl,
        }),
      )
      .max(20),
  }),
  defaults: () => ({ links: [] }),
});

export const embedBlock = defineBlock({
  type: "embed",
  name: "Embed",
  description: "Embedded media by URL — YouTube, Spotify, and friends.",
  capabilities: ["embeddable", "interactive"],
  schema: z.object({
    url: storableUrl,
    title: z.string().max(120).optional(),
  }),
  defaults: () => ({ url: "https://", title: "" }),
});

export const textBlock = defineBlock({
  type: "text",
  name: "Text",
  description: "A paragraph: bio detail, hours, announcement, fine print.",
  capabilities: ["printable", "searchable", "exportable", "seo"],
  schema: z.object({
    text: z.string().min(1).max(2000),
  }),
  defaults: () => ({ text: "" }),
});

export const surfacesBlock = defineBlock({
  type: "surfaces",
  name: "Save & share",
  description: "Your profile in every format — vCard, QR, business card, and machine surfaces.",
  capabilities: ["shareable", "exportable", "printable"],
  schema: z.object({
    title: z.string().max(80).optional(),
    // The human trio defaults ON (undefined = on); the machine surfaces
    // default OFF (must be explicitly true) — see the renderer.
    vcard: z.boolean().optional(),
    qr: z.boolean().optional(),
    card: z.boolean().optional(),
    md: z.boolean().optional(),
    json: z.boolean().optional(),
  }),
  defaults: () => ({ title: "", vcard: true, qr: true, card: true, md: false, json: false }),
});

export const giveawayBlock = defineBlock({
  type: "giveaway",
  name: "Giveaway",
  description: "Host a provably fair giveaway — entrants become verified leads.",
  capabilities: ["shareable", "interactive", "seo"],
  schema: z.object({
    /** Server-assigned on first save — links the block to its raffle doc. */
    raffleId: z.string().max(40).optional(),
    prize: z.string().min(1).max(120),
    description: z.string().max(600).optional(),
    image: z.string().max(200_000).optional(),
    /** ISO datetime — entries stop here; validated server-side per entry. */
    closesAt: z.string().max(40),
    winners: z.number().int().min(1).max(20).default(1),
    /** The owner's rules — the fine print, rendered on the entry page. */
    rules: z.string().max(1200).optional(),
    /** Scarcity cap — TOTAL spots; entries stop early when they fill.
     *  min 1: "first verified entry wins" is a legit flash-drop. The
     *  one-entry-per-PERSON rule is separate and always on. */
    maxEntries: z.number().int().min(1).max(100000).optional(),
  }),
  defaults: () => ({
    prize: "",
    description: "",
    image: "",
    closesAt: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString().slice(0, 16),
    winners: 1,
  }),
});

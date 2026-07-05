/**
 * Built-in block types.
 *
 * These register through the same defineBlock() API any third-party
 * developer uses — the Extension Promise, kept from commit one.
 */

import { z } from "zod";
import { defineBlock } from "../registry";

export const linkBlock = defineBlock({
  type: "link",
  name: "Link",
  description: "A destination: URL, label, optional icon. The atom of Links.",
  capabilities: ["shareable", "qr", "searchable", "exportable", "schedulable", "seo"],
  schema: z.object({
    label: z.string().min(1).max(120),
    url: z.string().url(),
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
          url: z.string().url(),
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
    url: z.string().url(),
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

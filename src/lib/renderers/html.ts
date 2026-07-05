/**
 * HTML profile renderer — registry citizen number one.
 *
 * Server-rendered, mobile-first, zero client JavaScript for viewers.
 * A visitor's phone gets one small HTML document; the React app is for
 * editing, never for viewing.
 */

import type { Block, IdentityManifest } from "../identity";
import { defineRenderer, type RenderContext } from "../registry";

const THEMES: Record<string, { bg: string; card: string; text: string; sub: string; accent: string }> = {
  midnight: { bg: "#070a12", card: "#11162299", text: "#f8fafc", sub: "#94a3b8", accent: "#22d3ee" },
  terminal: { bg: "#05080a", card: "#0c141066", text: "#e2f9ee", sub: "#6ee7b7", accent: "#34d399" },
  violet:   { bg: "#0b0714", card: "#1a112999", text: "#f5f3ff", sub: "#a78bfa", accent: "#8b5cf6" },
  ember:    { bg: "#120806", card: "#22110d99", text: "#fff7ed", sub: "#fdba74", accent: "#f97316" },
  rosegold: { bg: "#140a0d", card: "#24121899", text: "#fff1f2", sub: "#fda4af", accent: "#fb7185" },
  forest:   { bg: "#06110b", card: "#0d1f1599", text: "#f0fdf4", sub: "#86efac", accent: "#22c55e" },
  daylight: { bg: "#f8fafc", card: "#ffffffcc", text: "#0f172a", sub: "#475569", accent: "#0284c7" },
  mono:     { bg: "#0a0a0a", card: "#16161699", text: "#fafafa", sub: "#a3a3a3", accent: "#e5e5e5" },
  slate:    { bg: "#0b1017", card: "#151d2999", text: "#f1f5f9", sub: "#94a3b8", accent: "#38bdf8" },
};

function esc(s: unknown): string {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function safeUrl(u: unknown): string {
  const s = String(u ?? "");
  if (/^(https?:|mailto:|tel:)/i.test(s)) return s;
  return "#";
}

/** Click-tracked outbound URL: /go/:identityId/:blockId?to=... */
function go(origin: string, m: IdentityManifest, blockId: string, url: string): string {
  return `${origin}/go/${encodeURIComponent(m.identityId)}/${encodeURIComponent(blockId)}?to=${encodeURIComponent(url)}`;
}

function embedFrame(url: string): string | null {
  const yt = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]{6,})/);
  if (yt) return `https://www.youtube-nocookie.com/embed/${yt[1]}`;
  const sp = url.match(/open\.spotify\.com\/(track|album|playlist|artist)\/(\w+)/);
  if (sp) return `https://open.spotify.com/embed/${sp[1]}/${sp[2]}`;
  return null;
}

function renderBlock(b: Block, m: IdentityManifest, origin: string): string {
  const d = b.data as Record<string, unknown>;
  switch (b.type) {
    case "header":
      return `<h2 class="hd">${esc(d.text)}</h2>`;
    case "text":
      return `<p class="tx">${esc(d.text)}</p>`;
    case "link": {
      const url = safeUrl(d.url);
      const icon = d.icon ? `<span class="ic">${esc(d.icon)}</span>` : "";
      return `<a class="lk" href="${esc(go(origin, m, b.id, url))}" rel="noopener">${icon}<span>${esc(d.label)}</span></a>`;
    }
    case "social": {
      const links = Array.isArray(d.links) ? (d.links as Array<Record<string, unknown>>) : [];
      if (!links.length) return "";
      const items = links
        .map(
          (l) =>
            `<a class="so" href="${esc(go(origin, m, b.id, safeUrl(l.url)))}" rel="noopener">${esc(l.network)}</a>`,
        )
        .join("");
      return `<div class="sr">${items}</div>`;
    }
    case "embed": {
      const src = embedFrame(String(d.url ?? ""));
      if (src) {
        return `<div class="em"><iframe src="${esc(src)}" title="${esc(d.title || "Embedded media")}" loading="lazy" allowfullscreen allow="encrypted-media"></iframe></div>`;
      }
      return `<a class="lk" href="${esc(go(origin, m, b.id, safeUrl(d.url)))}" rel="noopener"><span>${esc(d.title || d.url)}</span></a>`;
    }
    default:
      return "";
  }
}

export function renderProfileHtml(m: IdentityManifest, ctx: RenderContext): string {
  const t = THEMES[m.theme ?? "midnight"] ?? THEMES.midnight;
  const origin = ctx.origin;
  const url = `${origin}/${esc(m.handle)}`;
  const title = `${esc(m.displayName)} (@${esc(m.handle)})`;
  const desc = esc(m.bio ?? `${m.displayName} on NEDB Links`);
  const avatar = m.avatar
    ? `<img class="av" src="${esc(safeUrl(m.avatar))}" alt="${esc(m.displayName)}" />`
    : `<div class="av avf">${esc(m.displayName.slice(0, 1).toUpperCase())}</div>`;
  const blocks = [...m.blocks]
    .sort((a, b) => a.order - b.order)
    .map((b) => renderBlock(b, m, origin))
    .join("\n");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${title}</title>
<meta name="description" content="${desc}" />
<meta property="og:type" content="profile" />
<meta property="og:title" content="${title}" />
<meta property="og:description" content="${desc}" />
<meta property="og:url" content="${url}" />
<meta name="twitter:card" content="summary" />
<link rel="canonical" href="${url}" />
<style>
  :root { color-scheme: dark light; }
  * { margin: 0; box-sizing: border-box; }
  body {
    background: ${t.bg}; color: ${t.text};
    font: 16px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif;
    min-height: 100dvh; display: flex; justify-content: center;
  }
  main { width: 100%; max-width: 560px; padding: 48px 20px 64px; }
  .id { text-align: center; margin-bottom: 28px; }
  .av { width: 88px; height: 88px; border-radius: 50%; object-fit: cover;
        border: 2px solid ${t.accent}55; }
  .avf { display: inline-flex; align-items: center; justify-content: center;
         font-size: 36px; font-weight: 700; color: ${t.accent};
         background: ${t.card}; }
  h1 { font-size: 24px; font-weight: 800; margin-top: 14px; letter-spacing: -0.02em; }
  .hn { color: ${t.accent}; font-size: 14px; font-weight: 600; margin-top: 2px; }
  .bio { color: ${t.sub}; font-size: 15px; margin-top: 10px; }
  .hd { font-size: 13px; font-weight: 700; text-transform: uppercase;
        letter-spacing: 0.1em; color: ${t.sub}; margin: 26px 4px 2px; }
  .tx { color: ${t.sub}; font-size: 15px; margin: 10px 4px; }
  .lk { display: flex; align-items: center; justify-content: center; gap: 10px;
        background: ${t.card}; color: ${t.text}; text-decoration: none;
        border: 1px solid ${t.accent}22; border-radius: 14px;
        padding: 16px 18px; margin: 10px 0; font-weight: 600;
        transition: transform 0.12s ease, border-color 0.12s ease;
        -webkit-backdrop-filter: blur(8px); backdrop-filter: blur(8px); }
  .lk:hover { transform: translateY(-1px); border-color: ${t.accent}66; }
  .ic { color: ${t.accent}; }
  .sr { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; margin: 14px 0; }
  .so { color: ${t.accent}; text-decoration: none; font-size: 14px; font-weight: 600;
        border: 1px solid ${t.accent}33; border-radius: 999px; padding: 7px 14px; }
  .em { margin: 10px 0; border-radius: 14px; overflow: hidden; aspect-ratio: 16/9; }
  .em iframe { width: 100%; height: 100%; border: 0; }
  footer { text-align: center; margin-top: 40px; }
  footer a { color: ${t.sub}; font-size: 12px; text-decoration: none; }
  footer a b { color: ${t.accent}; font-weight: 700; }
</style>
</head>
<body>
<main>
  <header class="id">
    ${avatar}
    <h1>${esc(m.displayName)}</h1>
    <div class="hn">@${esc(m.handle)}</div>
    ${m.bio ? `<p class="bio">${esc(m.bio)}</p>` : ""}
  </header>
  <section>
${blocks}
  </section>
  <footer>
    <a href="${origin}" rel="noopener"><b>⬡</b> published with NEDB Links</a>
  </footer>
</main>
</body>
</html>`;
}

export const htmlRenderer = defineRenderer({
  id: "html",
  name: "Profile page",
  description: "The public profile — server-rendered, mobile-first, no client JS.",
  consumes: ["shareable", "embeddable", "interactive", "seo"],
  render: (manifest, ctx) => ({
    contentType: "text/html; charset=utf-8",
    body: renderProfileHtml(manifest, ctx),
  }),
});

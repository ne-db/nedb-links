/**
 * HTML profile renderer — registry citizen number one.
 *
 * Server-rendered, mobile-first, zero client JavaScript for viewers.
 * A visitor's phone gets one small HTML document; the React app is for
 * editing, never for viewing.
 */

import { anchorOf, bgCss, pageInkOn, type BackgroundConfig } from "../background";
import { FONTS, isFilledUrl, type Block, type IdentityManifest } from "../identity";
import { defineRenderer, type RenderContext } from "../registry";
import { socialGlyph } from "./social-icons";

export interface ThemePalette {
  /** Page background — a color OR a CSS gradient string. */
  bg: string;
  card: string;
  text: string;
  sub: string;
  accent: string;
  /** Solid anchor for color-only positions (borders, text color) when
   *  bg is a gradient. Renderers use solidBg(t), never t.bg, there. */
  base?: string;
  /** Ink for text sitting DIRECTLY on the page background (name, bio,
   *  headers, footer). Set by background overrides so page text stays
   *  readable over any canvas; cards keep text/sub. Absent = text/sub. */
  pageText?: string;
  pageSub?: string;
}

/** The solid stand-in for gradient backgrounds. */
export function solidBg(t: ThemePalette): string {
  return t.base ?? t.bg;
}

/** Ink for content on the page canvas (vs. inside cards). */
export function pageText(t: ThemePalette): string {
  return t.pageText ?? t.text;
}
export function pageSub(t: ThemePalette): string {
  return t.pageSub ?? t.sub;
}

/**
 * Compose a manifest-level background over a theme: the canvas (and its
 * solid anchor + page ink) comes from the background; cards, accents,
 * and card text stay with the theme. This is why Midnight-behind-Signal
 * and Forest-behind-Mach both just work.
 */
export function applyBackground(t: ThemePalette, bg?: BackgroundConfig): ThemePalette {
  if (!bg) return t;
  const anchor = anchorOf(bg);
  const ink = pageInkOn(anchor);
  return { ...t, bg: bgCss(bg), base: anchor, pageText: ink.text, pageSub: ink.sub };
}

export const THEMES: Record<string, ThemePalette> = {
  pro:      { bg: "#f3f6f8", card: "#ffffffee", text: "#0f172a", sub: "#475569", accent: "#0e7490" },
  signal:   { bg: "#0f172a", card: "#1e293bcc", text: "#f8fafc", sub: "#94a3b8", accent: "#60a5fa" },
  mach:     { bg: "#0b0d11", card: "#161a2299", text: "#f4f6f9", sub: "#9aa7b8", accent: "#cbd5e1" },
  midnight: { bg: "#070a12", card: "#11162299", text: "#f8fafc", sub: "#94a3b8", accent: "#22d3ee" },
  terminal: { bg: "#05080a", card: "#0c141066", text: "#e2f9ee", sub: "#6ee7b7", accent: "#34d399" },
  violet:   { bg: "#0b0714", card: "#1a112999", text: "#f5f3ff", sub: "#a78bfa", accent: "#8b5cf6" },
  ember:    { bg: "#120806", card: "#22110d99", text: "#fff7ed", sub: "#fdba74", accent: "#f97316" },
  rosegold: { bg: "#140a0d", card: "#24121899", text: "#fff1f2", sub: "#fda4af", accent: "#fb7185" },
  forest:   { bg: "#06110b", card: "#0d1f1599", text: "#f0fdf4", sub: "#86efac", accent: "#22c55e" },
  daylight: { bg: "#f8fafc", card: "#ffffffcc", text: "#0f172a", sub: "#475569", accent: "#0284c7" },
  mono:     { bg: "#0a0a0a", card: "#16161699", text: "#fafafa", sub: "#a3a3a3", accent: "#e5e5e5" },
  slate:    { bg: "#0b1017", card: "#151d2999", text: "#f1f5f9", sub: "#94a3b8", accent: "#38bdf8" },
  // ── The gradient tier — flagship strength, still one HTML file, zero JS ──
  aurora:   { bg: "linear-gradient(165deg,#0b1026 0%,#1e1b4b 45%,#172554 100%)", base: "#141a3a",
              card: "#1e1b4b99", text: "#eef2ff", sub: "#a5b4fc", accent: "#818cf8" },
  sunset:   { bg: "linear-gradient(160deg,#2a1445 0%,#7c2d5c 55%,#b4530a 100%)", base: "#3b1d4f",
              card: "#3b1d4f99", text: "#fff7ed", sub: "#fdba74", accent: "#fb923c" },
  ocean:    { bg: "linear-gradient(170deg,#031c26 0%,#0c4a6e 60%,#043c50 100%)", base: "#062a38",
              card: "#0c4a6e80", text: "#ecfeff", sub: "#67e8f9", accent: "#22d3ee" },
  noir:     { bg: "radial-gradient(130% 130% at 50% 0%,#26262b 0%,#0a0a0c 60%)", base: "#111114",
              card: "#1c1c2166", text: "#fafafa", sub: "#a1a1aa", accent: "#e4e4e7" },
  blossom:  { bg: "linear-gradient(160deg,#fdf2f8 0%,#ede9fe 60%,#fce7f3 100%)", base: "#fdf2f8",
              card: "#ffffffd9", text: "#500724", sub: "#9d174d", accent: "#db2777" },
  citrus:   { bg: "linear-gradient(160deg,#f7fee7 0%,#ecfccb 45%,#d9f99d 100%)", base: "#f7fee7",
              card: "#ffffffcc", text: "#1a2e05", sub: "#4d7c0f", accent: "#65a30d" },
};

export function esc(s: unknown): string {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function safeUrl(u: unknown): string {
  const s = String(u ?? "");
  if (/^(https?:|mailto:|tel:)/i.test(s)) return s;
  return "#";
}

/** Google Fonts link for the manifest's curated picks — built from the
 *  FONTS map only (user input is an enum id, never a string). */
export function fontAssets(m: IdentityManifest): {
  link: string;
  headingCss: string;
  bodyCss: string;
} {
  const heading = FONTS[m.themeCustom?.headingFont ?? "system"];
  const body = FONTS[m.themeCustom?.bodyFont ?? "system"];
  const families = [...new Set([heading.google, body.google].filter(Boolean))] as string[];
  const link = families.length
    ? `<link rel="preconnect" href="https://fonts.googleapis.com" />\n<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />\n<link href="https://fonts.googleapis.com/css2?${families.map((f) => `family=${f}`).join("&")}&display=swap" rel="stylesheet" />`
    : "";
  return { link, headingCss: heading.css, bodyCss: body.css };
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
      // Placeholder URLs are saveable but never rendered — an unfilled
      // template link doesn't exist as far as the public page knows.
      if (!isFilledUrl(d.url)) return "";
      const url = safeUrl(d.url);
      const icon = d.icon ? `<span class="ic">${esc(d.icon)}</span>` : "";
      return `<a class="lk${d.icon ? "" : " noic"}" href="${esc(go(origin, m, b.id, url))}" rel="noopener">${icon}<span>${esc(d.label)}</span><span class="ar">›</span></a>`;
    }
    case "social":
      // Social profiles are identity, not content — they render as the
      // brand-icon row in the page header, not here.
      return "";
    case "embed": {
      if (!isFilledUrl(d.url)) return "";
      const src = embedFrame(String(d.url ?? ""));
      if (src) {
        return `<div class="em"><iframe src="${esc(src)}" title="${esc(d.title || "Embedded media")}" loading="lazy" allowfullscreen allow="encrypted-media"></iframe></div>`;
      }
      return `<a class="lk noic" href="${esc(go(origin, m, b.id, safeUrl(d.url)))}" rel="noopener"><span>${esc(d.title || d.url)}</span><span class="ar">›</span></a>`;
    }
    default:
      return "";
  }
}

export function renderProfileHtml(m: IdentityManifest, ctx: RenderContext): string {
  const t: ThemePalette = applyBackground(
    m.themeCustom ?? THEMES[m.theme ?? "pro"] ?? THEMES.pro,
    m.background,
  );
  const origin = ctx.origin;
  const brand = esc(ctx.brand ?? "NEDB Links");
  const url = `${origin}/${esc(m.handle)}`;
  const title = `${esc(m.displayName)} (@${esc(m.handle)})`;
  const desc = esc(m.bio ?? `${m.displayName} on ${ctx.brand ?? "NEDB Links"}`);
  const avatar = m.avatar
    ? `<img class="av" src="${esc(safeUrl(m.avatar))}" alt="${esc(m.displayName)}" />`
    : `<div class="av avf">${esc(m.displayName.slice(0, 1).toUpperCase())}</div>`;
  const blocks = [...m.blocks]
    .sort((a, b) => a.order - b.order)
    .map((b) => renderBlock(b, m, origin))
    .join("\n");
  const fonts = fontAssets(m);

  // The icon row — every filled social link across the manifest, brand
  // glyph auto-detected, click-tracked, right under the bio. The second
  // thing a visitor sees.
  const socialLinks = m.blocks
    .filter((b) => b.type === "social")
    .flatMap((b) => {
      const links = Array.isArray((b.data as Record<string, unknown>).links)
        ? ((b.data as Record<string, unknown>).links as Array<Record<string, unknown>>)
        : [];
      return links
        .filter((l) => isFilledUrl(l.url))
        .map((l) => ({
          blockId: b.id,
          network: String(l.network ?? ""),
          url: safeUrl(l.url),
        }));
    });
  const socialRow = socialLinks.length
    ? `<div class="si">${socialLinks
        .map((l) => {
          const g = socialGlyph(l.network, l.url);
          return `<a class="sb" href="${esc(go(origin, m, l.blockId, l.url))}" rel="noopener" title="${esc(g.label)}" aria-label="${esc(g.label)}"><svg viewBox="0 0 24 24" role="img" aria-hidden="true">${g.inner}</svg></a>`;
        })
        .join("")}</div>`
    : "";

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
${fonts.link}
<style>
  :root { color-scheme: dark light; }
  * { margin: 0; box-sizing: border-box; }
  body {
    background: ${t.bg}; color: ${pageText(t)};
    font: 16px/1.55 ${fonts.bodyCss};
    min-height: 100dvh; display: flex; justify-content: center;
    position: relative;
  }
  /* Atmosphere — a soft accent aurora behind the header. Pure CSS,
     per-theme, invisible on printouts. */
  body::before {
    content: ""; position: fixed; inset: 0; z-index: 0; pointer-events: none;
    background:
      radial-gradient(60% 34% at 50% -4%, ${t.accent}24, transparent 70%),
      radial-gradient(42% 26% at 82% 8%, ${t.accent}10, transparent 70%);
  }
  h1, .hd { font-family: ${fonts.headingCss}; }
  main { width: 100%; max-width: 600px; padding: 56px 22px 72px; position: relative; z-index: 1; }

  /* Staggered entrance — CSS only, killed by reduced-motion. */
  @keyframes rise { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
  .id { animation: rise 0.5s ease both; }
  section > * { animation: rise 0.5s ease both; }
  section > *:nth-child(1) { animation-delay: 0.06s; }
  section > *:nth-child(2) { animation-delay: 0.1s; }
  section > *:nth-child(3) { animation-delay: 0.14s; }
  section > *:nth-child(4) { animation-delay: 0.18s; }
  section > *:nth-child(5) { animation-delay: 0.22s; }
  section > *:nth-child(n+6) { animation-delay: 0.26s; }
  footer { animation: rise 0.5s ease 0.3s both; }

  .id { text-align: center; margin-bottom: 34px; }
  /* Avatar in a gradient ring, floating on a soft glow. */
  .avw { display: inline-block; padding: 3px; border-radius: 50%;
         background: linear-gradient(140deg, ${t.accent}, ${t.accent}22 70%);
         box-shadow: 0 10px 34px -10px ${t.accent}66; }
  .av { display: block; width: 96px; height: 96px; border-radius: 50%;
        object-fit: cover; border: 3px solid ${solidBg(t)}; }
  .avf { display: flex; align-items: center; justify-content: center;
         font-size: 40px; font-weight: 800; color: ${t.accent};
         background: ${t.card}; }
  h1 { font-size: 28px; font-weight: 800; margin-top: 16px; letter-spacing: -0.025em; }
  .hn { color: ${t.accent}; font-size: 14px; font-weight: 600; margin-top: 3px; }
  .bio { color: ${pageSub(t)}; font-size: 15.5px; margin: 12px auto 0; max-width: 42ch; }

  .hd { font-size: 12px; font-weight: 700; text-transform: uppercase;
        letter-spacing: 0.14em; color: ${pageSub(t)}; margin: 30px 6px 6px; }
  .tx { color: ${pageSub(t)}; font-size: 15px; margin: 10px 6px; }

  /* Link cards — weight, hierarchy, and a chevron that leans in. */
  .lk { display: flex; align-items: center; gap: 12px;
        background: ${t.card}; color: ${t.text}; text-decoration: none;
        border: 1px solid ${t.accent}26; border-radius: 16px;
        padding: 16px 18px; margin: 12px 0; font-weight: 600; font-size: 16px;
        box-shadow: 0 1px 2px rgba(0,0,0,0.08), 0 8px 24px -14px ${t.accent}40;
        transition: transform 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease;
        -webkit-backdrop-filter: blur(10px); backdrop-filter: blur(10px); }
  .lk:hover { transform: translateY(-2px); border-color: ${t.accent}77;
              box-shadow: 0 2px 4px rgba(0,0,0,0.08), 0 14px 34px -14px ${t.accent}59; }
  .lk:active { transform: scale(0.99); }
  .ic { display: inline-flex; align-items: center; justify-content: center;
        width: 36px; height: 36px; border-radius: 11px; flex: none;
        color: ${t.accent}; background: ${t.accent}14; font-size: 17px; }
  .lk > span:not(.ic):not(.ar) { flex: 1; text-align: left; }
  .lk.noic > span:not(.ar) { text-align: center; padding-left: 20px; }
  .ar { flex: none; color: ${t.accent}; opacity: 0.55; font-weight: 700;
        transition: transform 0.15s ease, opacity 0.15s ease; }
  .lk:hover .ar { transform: translateX(3px); opacity: 1; }

  .si { display: flex; flex-wrap: wrap; gap: 10px; justify-content: center; margin-top: 18px; }
  .sb { width: 44px; height: 44px; border-radius: 50%;
        display: inline-flex; align-items: center; justify-content: center;
        color: ${t.accent}; background: ${t.card};
        border: 1px solid ${t.accent}33; text-decoration: none;
        box-shadow: 0 1px 2px rgba(0,0,0,0.08), 0 6px 18px -10px ${t.accent}40;
        transition: transform 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease;
        -webkit-backdrop-filter: blur(10px); backdrop-filter: blur(10px); }
  .sb:hover { transform: translateY(-2px); border-color: ${t.accent}99;
              box-shadow: 0 2px 4px rgba(0,0,0,0.08), 0 10px 24px -10px ${t.accent}59; }
  .sb svg { width: 21px; height: 21px; fill: currentColor; }

  .em { margin: 12px 0; border-radius: 16px; overflow: hidden; aspect-ratio: 16/9;
        border: 1px solid ${t.accent}26;
        box-shadow: 0 1px 2px rgba(0,0,0,0.08), 0 8px 24px -14px ${t.accent}40; }
  .em iframe { width: 100%; height: 100%; border: 0; }

  footer { text-align: center; margin-top: 52px; }
  footer a { display: inline-flex; align-items: center; gap: 6px;
             color: ${pageSub(t)}; font-size: 12px; text-decoration: none;
             border: 1px solid ${t.accent}1f; border-radius: 999px;
             padding: 7px 14px; transition: border-color 0.15s ease, color 0.15s ease; }
  footer a:hover { border-color: ${t.accent}55; color: ${pageText(t)}; }
  footer a b { color: ${t.accent}; font-weight: 700; }

  @media (prefers-reduced-motion: reduce) {
    .id, section > *, footer { animation: none; }
    .lk, .sb, .ar { transition: none; }
  }
</style>
</head>
<body>
<main>
  <header class="id">
    <div class="avw">${avatar}</div>
    <h1>${esc(m.displayName)}</h1>
    <div class="hn">@${esc(m.handle)}</div>
    ${m.bio ? `<p class="bio">${esc(m.bio)}</p>` : ""}
    ${socialRow}
  </header>
  <section>
${blocks}
  </section>
  <footer>
    <a href="${origin}" rel="noopener"><b>⬡</b> published with ${brand}</a>
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

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "@interchained/portal-react";
import {
  AlignLeft,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  ArrowUpRight,
  BarChart3,
  Check,
  Copy,
  ExternalLink,
  Heading2,
  ImagePlus,
  Link2,
  Palette,
  Play,
  Plus,
  Share2,
  ShieldCheck,
  Trash2,
  X,
  type LucideIcon,
} from "lucide-react";

import { AccessPanel } from "../../src/components/AccessPanel";
import { Nav } from "../../src/components/Nav";
import { Gate } from "../../src/components/Gate";
import "../../src/lib/blocks/builtin";
import "../../src/lib/templates/builtin";
import { ApiError, fetchPreviewHtml, getJson, postJson, putJson } from "../../src/lib/api";
import { FONTS, newBlockId, type Block, type FontId, type IdentityManifest } from "../../src/lib/identity";
import { listBlocks } from "../../src/lib/registry";
import { LogoStudio } from "../../src/components/LogoStudio";
import { useAppConfig } from "../../src/lib/useAppConfig";
import { THEMES } from "../../src/lib/renderers/html";

export const intent = {
  purpose:
    "Edit an identity: blocks, order, theme, and meta — with a live preview rendered by the exact renderer the public page uses",
  primaryAction: "Save and publish",
  seoKeyword: "identity editor",
};

interface SaveReceipt {
  seq: number;
  head: string;
}

const BLOCK_ICONS: Record<string, LucideIcon> = {
  link: Link2,
  header: Heading2,
  text: AlignLeft,
  social: Share2,
  embed: Play,
};

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

/** A human summary line for a block card header. */
function blockSummary(b: Block): string {
  const d = b.data;
  switch (b.type) {
    case "link":
      return str(d.url) || "no url yet";
    case "header":
    case "text":
      return str(d.text).slice(0, 64) || "empty";
    case "embed":
      return str(d.url) || "no media yet";
    case "social": {
      const links = Array.isArray(d.links) ? d.links.length : 0;
      return `${links} network${links === 1 ? "" : "s"}`;
    }
    default:
      return b.type;
  }
}

function blockTitle(b: Block, fallback: string): string {
  const d = b.data;
  switch (b.type) {
    case "link":
      return str(d.label) || fallback;
    case "embed":
      return str(d.title) || fallback;
    default:
      return fallback;
  }
}

// ── Per-type block editors (the five built-ins) ──────────────────────────────

/**
 * The icon picker — tap, don't type. Curated glyphs + emoji that render
 * everywhere the icon travels: the zero-JS public page, the printed
 * business card, vCards. (Line-icon SVGs on public pages would need
 * server-side path inlining — a deliberate later, not a default.)
 * Every glyph the built-in templates seed is included, so seeded
 * blocks show as selected. Stored as the same plain string — zero
 * schema change, zero migration.
 */
const ICON_SET = [
  "▶", "◆", "★", "♥", "✂", "☰", "◷", "➤", "✎", "▤", "◉", "♫", "♪", "☏", "✋", "⌥", "◈", "⬡",
  "🔗", "🌐", "📍", "📅", "🛒", "🛍️", "💈", "💅", "💇", "📸", "🎥", "🎵", "🎤", "🎨",
  "✨", "🔥", "💼", "📖", "☕", "🍔", "🍕", "🧁", "🏋️", "🧘", "🐾", "🎁", "💳", "📞", "✉️", "⭐",
  "👑", "🌸", "🌿", "💎", "🚀", "🏠", "🗓️", "🎓",
];

function IconPicker({
  value,
  onPick,
}: {
  value: string;
  onPick: (icon: string) => void;
}): React.ReactElement {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="field !w-full text-center text-base leading-none !py-2"
        title={value ? `Icon: ${value} — tap to change` : "Pick an icon"}
      >
        {value || <span className="text-fg-faint text-sm">＋</span>}
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-2 w-72 panel p-3 shadow-card-hover">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold">Pick an icon</span>
            <button
              onClick={() => {
                onPick("");
                setOpen(false);
              }}
              className="text-[11px] text-fg-subtle hover:text-signal-red transition"
            >
              none
            </button>
          </div>
          <div className="grid grid-cols-8 gap-1">
            {ICON_SET.map((g) => (
              <button
                key={g}
                onClick={() => {
                  onPick(g);
                  setOpen(false);
                }}
                className={`h-8 rounded-lg text-base leading-none transition hover:bg-ink-850 ${
                  value === g ? "ring-2 ring-accent bg-accent/10" : ""
                }`}
                title={g}
              >
                {g}
              </button>
            ))}
          </div>
          <input
            value={value}
            onChange={(e) => onPick(e.target.value.slice(0, 4))}
            placeholder="or type your own"
            className="field mt-2 !py-1.5 text-center text-sm"
          />
        </div>
      )}
    </div>
  );
}

function BlockFields({
  block,
  onChange,
}: {
  block: Block;
  onChange: (data: Record<string, unknown>) => void;
}): React.ReactElement {
  const d = block.data;
  switch (block.type) {
    case "link":
      return (
        <div className="grid sm:grid-cols-[1fr_2fr_72px] gap-3">
          <div>
            <label className="label">Label</label>
            <input className="field" value={str(d.label)} onChange={(e) => onChange({ ...d, label: e.target.value })} />
          </div>
          <div>
            <label className="label">URL</label>
            <input className="field" value={str(d.url)} placeholder="https:// · tel: · mailto:" onChange={(e) => onChange({ ...d, url: e.target.value })} />
          </div>
          <div>
            <label className="label">Icon</label>
            <IconPicker value={str(d.icon)} onPick={(icon) => onChange({ ...d, icon })} />
          </div>
        </div>
      );
    case "header":
      return (
        <div>
          <label className="label">Heading</label>
          <input className="field" value={str(d.text)} onChange={(e) => onChange({ ...d, text: e.target.value })} />
        </div>
      );
    case "text":
      return (
        <div>
          <label className="label">Text</label>
          <textarea className="field min-h-[64px]" value={str(d.text)} onChange={(e) => onChange({ ...d, text: e.target.value })} />
        </div>
      );
    case "embed":
      return (
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className="label">Media URL (YouTube, Spotify…)</label>
            <input className="field" value={str(d.url)} onChange={(e) => onChange({ ...d, url: e.target.value })} />
          </div>
          <div>
            <label className="label">Title</label>
            <input className="field" value={str(d.title)} onChange={(e) => onChange({ ...d, title: e.target.value })} />
          </div>
        </div>
      );
    case "social": {
      const links = Array.isArray(d.links) ? (d.links as Array<Record<string, unknown>>) : [];
      const setLinks = (next: Array<Record<string, unknown>>) => onChange({ ...d, links: next });
      return (
        <div className="grid gap-2">
          {links.map((l, i) => (
            <div key={i} className="grid grid-cols-[1fr_2fr_36px] gap-2">
              <input className="field" placeholder="network (instagram…)" value={str(l.network)} onChange={(e) => setLinks(links.map((x, j) => (j === i ? { ...x, network: e.target.value } : x)))} />
              <input className="field" placeholder="https://…" value={str(l.url)} onChange={(e) => setLinks(links.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))} />
              <button onClick={() => setLinks(links.filter((_, j) => j !== i))} className="icon-btn icon-btn-danger self-center" title="Remove">
                <X size={15} />
              </button>
            </div>
          ))}
          <button onClick={() => setLinks([...links, { network: "", url: "https://" }])} className="justify-self-start text-xs font-semibold text-accent-soft hover:underline underline-offset-4">
            + add social link
          </button>
        </div>
      );
    }
    default:
      return <p className="text-xs text-fg-subtle font-mono">unknown block type: {block.type}</p>;
  }
}

// ── Theme gallery — actual miniature previews, not pills ─────────────────────

function ThemeMini({ palette }: { palette: { bg: string; card: string; text: string; sub: string; accent: string } }): React.ReactElement {
  return (
    <div className="h-20 flex flex-col items-center justify-center gap-1.5 px-3" style={{ background: palette.bg }}>
      <div className="w-6 h-6 rounded-full border-2 shrink-0" style={{ borderColor: palette.accent, background: palette.card }} />
      <div className="h-1 w-10 rounded-full" style={{ background: palette.text, opacity: 0.85 }} />
      <div className="w-full max-w-[88px] rounded-md px-2 py-1 flex items-center gap-1.5" style={{ background: palette.card }}>
        <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: palette.accent }} />
        <div className="h-1 flex-1 rounded-full" style={{ background: palette.sub, opacity: 0.7 }} />
      </div>
    </div>
  );
}

// ── The editor ────────────────────────────────────────────────────────────────

export default function EditPage(): React.ReactElement {
  const { id } = useParams<{ id: string }>();
  const cfg = useAppConfig();
  const uploadsOn = Boolean(cfg?.uploads);
  const fileInput = useRef<HTMLInputElement | null>(null);
  const [studioFile, setStudioFile] = useState<File | null>(null);
  const uploading = studioFile !== null;
  const [manifest, setManifest] = useState<IdentityManifest | null>(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<"save" | "publish" | null>(null);
  const [receipt, setReceipt] = useState<SaveReceipt | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);
  const [previewHtml, setPreviewHtml] = useState<string>("");
  const [addOpen, setAddOpen] = useState(false);
  const previewSeq = useRef(0);

  const blockDefs = useMemo(() => listBlocks(), []);

  const load = useCallback(async () => {
    setError(null);
    setLocked(false);
    try {
      const j = await getJson<{ manifest: IdentityManifest }>(`/api/identities/${encodeURIComponent(id)}`);
      setManifest(j.manifest);
      setDirty(false);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setLocked(true);
        return;
      }
      setError(err instanceof Error ? err.message : "failed to load identity");
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  // Unsaved-changes guard.
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  // Live preview — debounced round-trip through the REAL renderer.
  useEffect(() => {
    if (!manifest) return;
    const seq = ++previewSeq.current;
    const t = setTimeout(async () => {
      try {
        const html = await fetchPreviewHtml({
          identityId: manifest.identityId,
          identityType: manifest.identityType,
          handle: manifest.handle,
          displayName: manifest.displayName,
          bio: manifest.bio,
          avatar: manifest.avatar,
          theme: manifest.theme,
          themeCustom: manifest.themeCustom,
          blocks: manifest.blocks,
        });
        if (seq === previewSeq.current) setPreviewHtml(html);
      } catch {
        /* preview is best-effort; the editor keeps working */
      }
    }, 350);
    return () => clearTimeout(t);
  }, [manifest]);

  const patch = useCallback((p: Partial<IdentityManifest>) => {
    setManifest((m) => (m ? { ...m, ...p } : m));
    setDirty(true);
  }, []);

  const setBlocks = useCallback(
    (blocks: Block[]) => {
      patch({ blocks: blocks.map((b, i) => ({ ...b, order: i })) });
    },
    [patch],
  );

  /** Logo/avatar upload: picking a file opens the studio — position,
   *  zoom, backdrop — then bakes and uploads. */
  const doUpload = useCallback((file: File) => {
    setError(null);
    setStudioFile(file);
  }, []);

  const move = useCallback(
    (index: number, delta: -1 | 1) => {
      if (!manifest) return;
      const next = [...manifest.blocks].sort((a, b) => a.order - b.order);
      const target = index + delta;
      if (target < 0 || target >= next.length) return;
      [next[index], next[target]] = [next[target], next[index]];
      setBlocks(next);
    },
    [manifest, setBlocks],
  );

  const save = useCallback(async (): Promise<boolean> => {
    if (!manifest) return false;
    setBusy("save");
    setError(null);
    try {
      const j = await putJson<{ manifest: IdentityManifest; seq: number; head: string }>(
        `/api/identities/${encodeURIComponent(manifest.identityId)}`,
        {
          displayName: manifest.displayName,
          bio: manifest.bio,
          avatar: manifest.avatar,
          theme: manifest.theme,
          themeCustom: manifest.themeCustom ?? null,
          blocks: manifest.blocks,
        },
      );
      setManifest(j.manifest);
      setReceipt({ seq: j.seq, head: j.head });
      setDirty(false);
      return true;
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) setLocked(true);
      else setError(err instanceof Error ? err.message : "save failed");
      return false;
    } finally {
      setBusy(null);
    }
  }, [manifest]);

  const publish = useCallback(async () => {
    if (!manifest) return;
    if (dirty) {
      const ok = await save();
      if (!ok) return;
    }
    setBusy("publish");
    setError(null);
    try {
      const j = await postJson<{ manifest: IdentityManifest; seq: number; head: string }>(
        `/api/identities/${encodeURIComponent(manifest.identityId)}/publish`,
      );
      setManifest(j.manifest);
      setReceipt({ seq: j.seq, head: j.head });
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) setLocked(true);
      else setError(err instanceof Error ? err.message : "publish failed");
    } finally {
      setBusy(null);
    }
  }, [manifest, dirty, save]);

  // ⌘S / Ctrl+S — the studio reflex.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (dirty && busy === null) void save();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [dirty, busy, save]);

  if (locked) {
    return (
      <>
        <Nav />
        <Gate onReady={() => void load()} />
      </>
    );
  }

  if (!manifest) {
    return (
      <>
        <Nav />
        <main className="max-w-5xl mx-auto px-5 py-16 text-center text-fg-muted">
          {error ? <p className="text-signal-red font-mono text-sm">{error}</p> : <p>Loading…</p>}
        </main>
      </>
    );
  }

  const ordered = [...manifest.blocks].sort((a, b) => a.order - b.order);
  const published = manifest.status === "published";

  return (
    <>
      {/* ONE nav — the editor projects its identity + commands into it. */}
      <Nav
        context={
          <>
            <Link href="/identities" className="icon-btn !w-7 !h-7 shrink-0" title="All identities">
              <ArrowLeft size={15} />
            </Link>
            <h1 className="font-display text-sm font-bold truncate">
              {manifest.displayName}
            </h1>
            <span className="hidden sm:inline font-mono text-[11px] text-accent-soft truncate shrink-0">
              @{manifest.handle}
            </span>
            <span
              className={`chip shrink-0 ${
                published
                  ? "text-signal-green border-signal-green/40 bg-signal-green/10"
                  : "text-signal-amber border-signal-amber/40 bg-signal-amber/10"
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${published ? "bg-signal-green" : "bg-signal-amber"} ${dirty ? "animate-pulse" : ""}`} />
              {published ? "Live" : "Draft"}
              {dirty ? " · unsaved" : ""}
            </span>
          </>
        }
        actions={
          <>
            <Link
              href={`/analytics/${encodeURIComponent(manifest.identityId)}`}
              className="icon-btn !w-7 !h-7"
              title="Analytics — views, scans, clicks"
            >
              <BarChart3 size={15} />
            </Link>
            {published && (
              <a
                href={`/${manifest.handle}`}
                target="_blank"
                rel="noopener noreferrer"
                className="icon-btn !w-7 !h-7"
                title="View live page"
              >
                <ExternalLink size={15} />
              </a>
            )}
            <button onClick={() => void save()} disabled={busy !== null || !dirty} className="btn btn-secondary !py-1.5 !px-3" title="⌘S">
              {busy === "save" ? "Saving…" : "Save"}
            </button>
            <button onClick={() => void publish()} disabled={busy !== null} className="btn btn-primary !py-1.5 !px-3">
              {busy === "publish" ? "Publishing…" : published ? "Republish" : "Publish"}
              <ArrowUpRight size={14} />
            </button>
          </>
        }
      />

      {studioFile && (
        <LogoStudio
          file={studioFile}
          onDone={(url) => {
            patch({ avatar: url });
            setStudioFile(null);
          }}
          onClose={() => setStudioFile(null)}
        />
      )}

      <main className="max-w-7xl mx-auto px-5 py-8">
        {/* Engine receipt — provenance made visible, quietly */}
        {receipt && (
          <p className="mb-4 flex items-center gap-1.5 font-mono text-[11px] text-fg-subtle" title={receipt.head}>
            <ShieldCheck size={13} className="text-signal-green shrink-0" />
            engine receipt · seq {receipt.seq} · head {receipt.head.slice(0, 16)}… — every save is a
            hash-chained, causally-linked write
          </p>
        )}
        {error && <p className="mb-4 text-signal-red font-mono text-sm">{error}</p>}

        <div className="grid lg:grid-cols-[minmax(0,1fr)_400px] xl:grid-cols-[minmax(0,1fr)_430px] gap-8 items-start">
          {/* ── Left: the editor ─────────────────────────────────────────── */}
          <section className="grid gap-8">
            {/* Profile */}
            <div>
              <div className="mb-3 px-1">
                <h2 className="section-title">Profile</h2>
                <p className="section-desc">Name, bio, and avatar — the top of your page.</p>
              </div>
              <div className="panel p-5 sm:p-6 grid gap-4">
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <label className="label">Display name</label>
                    <input className="field" value={manifest.displayName} onChange={(e) => patch({ displayName: e.target.value })} />
                  </div>
                  <div>
                    <label className="label">Avatar / logo</label>
                    <div className="flex items-center gap-2">
                      {manifest.avatar && /^https?:\/\//i.test(manifest.avatar) && (
                        <img
                          src={manifest.avatar}
                          alt=""
                          className="w-9 h-9 rounded-full object-cover border border-ink-700 shrink-0"
                        />
                      )}
                      <input className="field" value={manifest.avatar ?? ""} placeholder="https://… or upload →" onChange={(e) => patch({ avatar: e.target.value || undefined })} />
                      {uploadsOn && (
                        <>
                          <input
                            ref={fileInput}
                            type="file"
                            accept="image/png,image/jpeg,image/webp,image/gif"
                            className="hidden"
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              e.target.value = "";
                              if (f) void doUpload(f);
                            }}
                          />
                          <button
                            onClick={() => fileInput.current?.click()}
                            disabled={uploading}
                            className="btn btn-secondary !py-2 !px-3 shrink-0"
                            title="Upload an image — resized & hosted automatically"
                          >
                            <ImagePlus size={15} className={uploading ? "animate-pulse" : ""} />
                            {uploading ? "Uploading…" : "Upload"}
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
                <div>
                  <label className="label">Bio</label>
                  <textarea className="field min-h-[56px]" value={manifest.bio ?? ""} onChange={(e) => patch({ bio: e.target.value || undefined })} />
                </div>
              </div>
            </div>

            {/* Blocks — each one an elevated card */}
            <div>
              <div className="mb-3 px-1">
                <h2 className="section-title">Blocks</h2>
                <p className="section-desc">Links, headers, embeds — the body of your page, in order.</p>
              </div>
              <div className="grid gap-3">
                {ordered.map((b, i) => {
                  const def = blockDefs.find((x) => x.type === b.type);
                  const Icon = BLOCK_ICONS[b.type] ?? Link2;
                  return (
                    <div key={b.id} className="panel p-4 sm:p-5">
                      <div className="flex items-center gap-3 mb-4">
                        <span className="w-8 h-8 rounded-[10px] bg-accent/10 text-accent-soft inline-flex items-center justify-center shrink-0">
                          <Icon size={16} />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold truncate">{blockTitle(b, def?.name ?? b.type)}</p>
                          <p className="text-xs text-fg-subtle truncate">{blockSummary(b)}</p>
                        </div>
                        <div className="flex items-center gap-0.5 shrink-0">
                          <button onClick={() => move(i, -1)} disabled={i === 0} className="icon-btn" title="Move up">
                            <ArrowUp size={15} />
                          </button>
                          <button onClick={() => move(i, 1)} disabled={i === ordered.length - 1} className="icon-btn" title="Move down">
                            <ArrowDown size={15} />
                          </button>
                          <button
                            onClick={() => {
                              const clone: Block = { ...b, id: newBlockId(), data: JSON.parse(JSON.stringify(b.data)) as Record<string, unknown> };
                              const next = [...ordered];
                              next.splice(i + 1, 0, clone);
                              setBlocks(next);
                            }}
                            className="icon-btn"
                            title="Duplicate"
                          >
                            <Copy size={15} />
                          </button>
                          <button onClick={() => setBlocks(ordered.filter((x) => x.id !== b.id))} className="icon-btn icon-btn-danger" title="Remove block">
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </div>
                      <BlockFields block={b} onChange={(data) => setBlocks(ordered.map((x) => (x.id === b.id ? { ...x, data } : x)))} />
                    </div>
                  );
                })}

                {/* Add block */}
                <div className="relative">
                  <button
                    onClick={() => setAddOpen((v) => !v)}
                    className="w-full rounded-2xl border border-dashed border-ink-700 text-fg-muted font-semibold text-sm py-4 hover:border-accent/50 hover:text-accent-soft transition inline-flex items-center justify-center gap-2"
                  >
                    <Plus size={16} /> Add block
                  </button>
                  {addOpen && (
                    <div className="absolute z-10 mt-2 w-full panel p-2 grid gap-1 shadow-card-hover">
                      {blockDefs.map((def) => {
                        const Icon = BLOCK_ICONS[def.type] ?? Link2;
                        return (
                          <button
                            key={def.type}
                            onClick={() => {
                              setBlocks([...ordered, { id: newBlockId(), type: def.type, order: ordered.length, data: def.defaults() }]);
                              setAddOpen(false);
                            }}
                            className="flex items-center gap-3 text-left rounded-xl px-3.5 py-2.5 hover:bg-ink-850 transition"
                          >
                            <span className="w-8 h-8 rounded-[10px] bg-accent/10 text-accent-soft inline-flex items-center justify-center shrink-0">
                              <Icon size={16} />
                            </span>
                            <span className="min-w-0">
                              <span className="block font-semibold text-sm">{def.name}</span>
                              <span className="block text-xs text-fg-subtle truncate">{def.description}</span>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Theme — a gallery, not pills */}
            <div>
              <div className="mb-3 px-1 flex items-end justify-between gap-3">
                <div>
                  <h2 className="section-title">Theme</h2>
                  <p className="section-desc">How your public page looks. The preview is the real renderer.</p>
                </div>
                <button
                  onClick={() => {
                    if (manifest.themeCustom) {
                      patch({ themeCustom: undefined });
                    } else {
                      const base = THEMES[manifest.theme ?? "pro"] ?? THEMES.pro;
                      patch({
                        themeCustom: {
                          bg: base.bg.slice(0, 7),
                          card: base.card.slice(0, 7),
                          text: base.text.slice(0, 7),
                          sub: base.sub.slice(0, 7),
                          accent: base.accent.slice(0, 7),
                        },
                      });
                    }
                  }}
                  className={`btn !py-1.5 !px-3 text-xs shrink-0 ${manifest.themeCustom ? "btn-secondary" : "btn-accent-ghost"}`}
                >
                  {manifest.themeCustom ? (
                    <>
                      <X size={13} /> Reset to theme
                    </>
                  ) : (
                    <>
                      <Palette size={13} /> Customize
                    </>
                  )}
                </button>
              </div>

              {!manifest.themeCustom ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
                  {Object.entries(THEMES).map(([key, t]) => {
                    const selected = (manifest.theme ?? "pro") === key;
                    return (
                      <button
                        key={key}
                        onClick={() => patch({ theme: key })}
                        className={`panel panel-lift overflow-hidden text-left ${selected ? "ring-2 ring-accent border-accent/40" : ""}`}
                        title={key}
                      >
                        <ThemeMini palette={t} />
                        <span className="px-3 py-2 flex items-center justify-between">
                          <span className="text-xs font-semibold capitalize">{key}</span>
                          {selected && <Check size={14} className="text-accent-soft shrink-0" />}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="panel p-5 grid gap-4">
                  <div className="grid grid-cols-5 gap-2">
                    {([
                      ["bg", "page"],
                      ["card", "cards"],
                      ["text", "text"],
                      ["sub", "muted"],
                      ["accent", "accent"],
                    ] as const).map(([key, label]) => (
                      <div key={key} className="text-center">
                        <input
                          type="color"
                          value={manifest.themeCustom?.[key] ?? "#000000"}
                          onChange={(e) =>
                            patch({
                              themeCustom: {
                                ...(manifest.themeCustom as NonNullable<typeof manifest.themeCustom>),
                                [key]: e.target.value,
                              },
                            })
                          }
                          className="h-10 w-full rounded-xl border border-ink-700 bg-ink-850 cursor-pointer"
                          title={label}
                        />
                        <span className="mt-1.5 block text-[10px] font-medium text-fg-subtle">
                          {label}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="grid sm:grid-cols-2 gap-3">
                    {([
                      ["headingFont", "Heading font"],
                      ["bodyFont", "Body font"],
                    ] as const).map(([key, label]) => (
                      <div key={key}>
                        <label className="label">{label}</label>
                        <select
                          value={manifest.themeCustom?.[key] ?? "system"}
                          onChange={(e) =>
                            patch({
                              themeCustom: {
                                ...(manifest.themeCustom as NonNullable<typeof manifest.themeCustom>),
                                [key]: e.target.value as FontId,
                              },
                            })
                          }
                          className="field"
                        >
                          {Object.entries(FONTS).map(([id, f]) => (
                            <option key={id} value={id}>
                              {f.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    ))}
                  </div>
                  <p className="text-[11px] text-fg-subtle">
                    Your page, your colors, your type — the preview is the real
                    renderer, so what you see is exactly what visitors get.
                  </p>
                </div>
              )}
            </div>

            <AccessPanel identityId={manifest.identityId} />
          </section>

          {/* ── Right: the hero — a floating device, always alive ─────────── */}
          <aside className="lg:sticky lg:top-16">
            <div className="device max-w-[390px] mx-auto">
              <div className="device-notch" />
              <div className="device-screen">
                <iframe title="Live preview" sandbox="" srcDoc={previewHtml} className="h-[620px]" />
              </div>
            </div>
            <p className="mt-4 text-center text-[11px] text-fg-subtle">
              Live preview — rendered by the exact renderer your visitors get.
            </p>
            {published && (
              <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
                {([
                  ["Page", `/${manifest.handle}`],
                  ["Card", `/${manifest.handle}?format=card`],
                  ["QR", `/${manifest.handle}?format=qr`],
                  ["vCard", `/${manifest.handle}?format=vcard`],
                ] as const).map(([label, href]) => (
                  <a
                    key={label}
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="chip text-fg-muted hover:text-accent-soft hover:border-accent/40 transition"
                  >
                    {label} <ArrowUpRight size={11} />
                  </a>
                ))}
              </div>
            )}
          </aside>
        </div>
      </main>
    </>
  );
}

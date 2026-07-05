import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "@interchained/portal-react";

import { AccessPanel } from "../../src/components/AccessPanel";
import { Nav } from "../../src/components/Nav";
import { AccountGate } from "../../src/components/AccountGate";
import "../../src/lib/blocks/builtin";
import "../../src/lib/templates/builtin";
import { ApiError, fetchPreviewHtml, getJson, postJson, putJson } from "../../src/lib/api";
import { newBlockId, type Block, type IdentityManifest } from "../../src/lib/identity";
import { listBlocks } from "../../src/lib/registry";
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

const inputCls =
  "w-full bg-ink-850 border border-ink-700 rounded-lg px-3 py-2 text-sm outline-none focus:border-accent/60 text-fg placeholder:text-fg-faint";
const labelCls = "block font-mono text-[10px] uppercase tracking-widest text-fg-subtle mb-1";

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

// ── Per-type block editors (the five built-ins) ──────────────────────────────

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
        <div className="grid grid-cols-[1fr_2fr_64px] gap-2">
          <div>
            <label className={labelCls}>Label</label>
            <input className={inputCls} value={str(d.label)} onChange={(e) => onChange({ ...d, label: e.target.value })} />
          </div>
          <div>
            <label className={labelCls}>URL</label>
            <input className={inputCls} value={str(d.url)} placeholder="https:// · tel: · mailto:" onChange={(e) => onChange({ ...d, url: e.target.value })} />
          </div>
          <div>
            <label className={labelCls}>Icon</label>
            <input className={inputCls} value={str(d.icon)} onChange={(e) => onChange({ ...d, icon: e.target.value })} />
          </div>
        </div>
      );
    case "header":
      return (
        <div>
          <label className={labelCls}>Heading</label>
          <input className={inputCls} value={str(d.text)} onChange={(e) => onChange({ ...d, text: e.target.value })} />
        </div>
      );
    case "text":
      return (
        <div>
          <label className={labelCls}>Text</label>
          <textarea className={`${inputCls} min-h-[64px]`} value={str(d.text)} onChange={(e) => onChange({ ...d, text: e.target.value })} />
        </div>
      );
    case "embed":
      return (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={labelCls}>Media URL (YouTube, Spotify…)</label>
            <input className={inputCls} value={str(d.url)} onChange={(e) => onChange({ ...d, url: e.target.value })} />
          </div>
          <div>
            <label className={labelCls}>Title</label>
            <input className={inputCls} value={str(d.title)} onChange={(e) => onChange({ ...d, title: e.target.value })} />
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
              <input className={inputCls} placeholder="network (instagram…)" value={str(l.network)} onChange={(e) => setLinks(links.map((x, j) => (j === i ? { ...x, network: e.target.value } : x)))} />
              <input className={inputCls} placeholder="https://…" value={str(l.url)} onChange={(e) => setLinks(links.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))} />
              <button onClick={() => setLinks(links.filter((_, j) => j !== i))} className="rounded-lg border border-ink-700 text-fg-muted hover:text-signal-red hover:border-signal-red/50 transition" title="Remove">
                ✕
              </button>
            </div>
          ))}
          <button onClick={() => setLinks([...links, { network: "", url: "https://" }])} className="justify-self-start text-xs font-bold text-accent-soft hover:underline underline-offset-4">
            + add social link
          </button>
        </div>
      );
    }
    default:
      return <p className="text-xs text-fg-subtle font-mono">unknown block type: {block.type}</p>;
  }
}

// ── The editor ────────────────────────────────────────────────────────────────

export default function EditPage(): React.ReactElement {
  const { id } = useParams<{ id: string }>();
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

  if (locked) {
    return (
      <>
        <Nav />
        <AccountGate onReady={() => void load()} />
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

  return (
    <>
      <Nav />
      <main className="max-w-7xl mx-auto px-5 py-8">
        {/* ── Header bar ─────────────────────────────────────────────────── */}
        <header className="flex flex-wrap items-center gap-3 justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <Link href="/identities" className="text-fg-subtle hover:text-fg-muted transition" title="All identities">
              ←
            </Link>
            <h1 className="font-display text-2xl font-bold truncate">{manifest.displayName}</h1>
            <span className="font-mono text-sm text-accent-soft shrink-0">@{manifest.handle}</span>
            <span
              className={`text-[11px] font-bold uppercase tracking-wider rounded-full px-2 py-0.5 border shrink-0 ${
                manifest.status === "published"
                  ? "text-signal-green border-signal-green/40 bg-signal-green/10"
                  : "text-signal-amber border-signal-amber/40 bg-signal-amber/10"
              }`}
            >
              {manifest.status}
              {dirty ? " · unsaved" : ""}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {manifest.status === "published" && (
              <a href={`/${manifest.handle}`} target="_blank" rel="noopener noreferrer" className="rounded-lg border border-ink-700 text-fg-muted text-sm font-semibold px-3.5 py-2 hover:border-accent/50 hover:text-accent-soft transition">
                View ↗
              </a>
            )}
            <button onClick={() => void save()} disabled={busy !== null || !dirty} className="rounded-lg border border-accent/50 text-accent-soft text-sm font-bold px-4 py-2 hover:bg-accent/10 transition disabled:opacity-40">
              {busy === "save" ? "Saving…" : "Save"}
            </button>
            <button onClick={() => void publish()} disabled={busy !== null} className="rounded-lg bg-accent text-ink-950 text-sm font-bold px-4 py-2 hover:brightness-110 transition disabled:opacity-40">
              {busy === "publish" ? "Publishing…" : manifest.status === "published" ? "Republish" : "Publish"}
            </button>
          </div>
        </header>

        {/* Engine receipt — provenance made visible */}
        {receipt && (
          <p className="mt-2 font-mono text-[11px] text-fg-subtle">
            engine receipt: seq {receipt.seq} · head {receipt.head.slice(0, 16)}… — every save is a
            hash-chained, causally-linked write
          </p>
        )}
        {error && <p className="mt-3 text-signal-red font-mono text-sm">{error}</p>}

        <div className="mt-6 grid lg:grid-cols-[1fr_400px] gap-6 items-start">
          {/* ── Left: meta + blocks ──────────────────────────────────────── */}
          <section className="grid gap-5">
            <div className="bg-ink-900 border border-ink-800 rounded-2xl p-5 grid gap-4">
              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Display name</label>
                  <input className={inputCls} value={manifest.displayName} onChange={(e) => patch({ displayName: e.target.value })} />
                </div>
                <div>
                  <label className={labelCls}>Avatar URL</label>
                  <input className={inputCls} value={manifest.avatar ?? ""} placeholder="https://…" onChange={(e) => patch({ avatar: e.target.value || undefined })} />
                </div>
              </div>
              <div>
                <label className={labelCls}>Bio</label>
                <textarea className={`${inputCls} min-h-[56px]`} value={manifest.bio ?? ""} onChange={(e) => patch({ bio: e.target.value || undefined })} />
              </div>
              <div>
                <div className="flex items-baseline justify-between">
                  <label className={labelCls}>Theme</label>
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
                    className={`font-mono text-[10px] uppercase tracking-widest transition ${
                      manifest.themeCustom
                        ? "text-signal-amber hover:text-signal-red"
                        : "text-accent-soft hover:underline underline-offset-4"
                    }`}
                  >
                    {manifest.themeCustom ? "✕ reset to theme" : "✦ customize colors"}
                  </button>
                </div>
                {!manifest.themeCustom ? (
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(THEMES).map(([key, t]) => (
                      <button
                        key={key}
                        onClick={() => patch({ theme: key })}
                        title={key}
                        className={`h-9 px-3 rounded-lg border text-xs font-bold transition ${
                          (manifest.theme ?? "pro") === key ? "border-accent text-accent-soft" : "border-ink-700 text-fg-muted hover:border-ink-700"
                        }`}
                        style={{ background: t.bg }}
                      >
                        <span style={{ color: t.accent }}>●</span> {key}
                      </button>
                    ))}
                  </div>
                ) : (
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
                          className="h-10 w-full rounded-lg border border-ink-700 bg-ink-850 cursor-pointer"
                          title={label}
                        />
                        <span className="mt-1 block font-mono text-[9px] uppercase tracking-widest text-fg-subtle">
                          {label}
                        </span>
                      </div>
                    ))}
                    <p className="col-span-5 text-[11px] text-fg-subtle">
                      Your page, your colors — the preview is the real renderer, so what
                      you see is exactly what visitors get.
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Blocks */}
            <div className="grid gap-3">
              {ordered.map((b, i) => {
                const def = blockDefs.find((x) => x.type === b.type);
                return (
                  <div key={b.id} className="bg-ink-900 border border-ink-800 rounded-2xl p-4">
                    <div className="flex items-center justify-between mb-3">
                      <span className="font-mono text-[11px] uppercase tracking-widest text-fg-subtle">
                        {def?.name ?? b.type}
                      </span>
                      <div className="flex items-center gap-1.5">
                        <button onClick={() => move(i, -1)} disabled={i === 0} className="w-7 h-7 rounded-lg border border-ink-700 text-fg-muted hover:text-accent-soft hover:border-accent/50 transition disabled:opacity-30" title="Move up">
                          ↑
                        </button>
                        <button onClick={() => move(i, 1)} disabled={i === ordered.length - 1} className="w-7 h-7 rounded-lg border border-ink-700 text-fg-muted hover:text-accent-soft hover:border-accent/50 transition disabled:opacity-30" title="Move down">
                          ↓
                        </button>
                        <button onClick={() => setBlocks(ordered.filter((x) => x.id !== b.id))} className="w-7 h-7 rounded-lg border border-ink-700 text-fg-muted hover:text-signal-red hover:border-signal-red/50 transition" title="Remove block">
                          ✕
                        </button>
                      </div>
                    </div>
                    <BlockFields block={b} onChange={(data) => setBlocks(ordered.map((x) => (x.id === b.id ? { ...x, data } : x)))} />
                  </div>
                );
              })}

              {/* Add block */}
              <div className="relative">
                <button onClick={() => setAddOpen((v) => !v)} className="w-full rounded-2xl border border-dashed border-ink-700 text-fg-muted font-semibold py-3.5 hover:border-accent/50 hover:text-accent-soft transition">
                  + Add block
                </button>
                {addOpen && (
                  <div className="absolute z-10 mt-2 w-full bg-ink-900 border border-ink-700 rounded-2xl p-2 grid gap-1 shadow-glow">
                    {blockDefs.map((def) => (
                      <button
                        key={def.type}
                        onClick={() => {
                          setBlocks([...ordered, { id: newBlockId(), type: def.type, order: ordered.length, data: def.defaults() }]);
                          setAddOpen(false);
                        }}
                        className="text-left rounded-xl px-3.5 py-2.5 hover:bg-ink-850 transition"
                      >
                        <span className="font-bold text-sm">{def.name}</span>
                        <span className="block text-xs text-fg-subtle">{def.description}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <AccessPanel identityId={manifest.identityId} />
          </section>

          {/* ── Right: live preview via the REAL renderer ────────────────── */}
          <aside className="lg:sticky lg:top-20">
            <div className="flex items-center justify-between mb-2 px-1">
              <span className="font-mono text-[10px] uppercase tracking-widest text-fg-subtle">
                Live preview — rendered by the exact public renderer
              </span>
            </div>
            <div className="bg-ink-900 border border-ink-800 rounded-[28px] p-2 shadow-glow">
              <iframe
                title="Live preview"
                sandbox=""
                srcDoc={previewHtml}
                className="w-full h-[640px] rounded-[22px] bg-ink-950"
              />
            </div>
          </aside>
        </div>
      </main>
    </>
  );
}

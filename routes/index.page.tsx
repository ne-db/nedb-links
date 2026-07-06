import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

import "../src/lib/blocks/builtin";
import "../src/lib/templates/builtin";
import { Nav } from "../src/components/Nav";
import { Gate } from "../src/components/Gate";
import { UpgradeCard } from "../src/components/UpgradeCard";
import { adminHeaders } from "../src/lib/api";
import { useAppConfig } from "../src/lib/useAppConfig";
import { isValidHandle } from "../src/lib/identity";
import { listTemplates } from "../src/lib/registry";

export const intent = {
  purpose:
    "Claim-first onboarding: type a handle, see availability instantly, seed from a template, publish, share",
  primaryAction: "Claim a handle",
  seoKeyword: "link in bio identity platform",
};

type Availability = "idle" | "checking" | "available" | "taken" | "invalid";

/**
 * The publish moment: every output of the loop in one place.
 * Share URL, print-grade QR (SVG + PNG), save-contact vCard, business
 * card, and the JSON surface — each one is a registered renderer over
 * the same Identity Manifest.
 */
function ShareKit({
  handle,
  identityId,
}: {
  handle: string;
  identityId: string;
}): React.ReactElement {
  const [copied, setCopied] = useState(false);
  const origin = window.location.origin;
  const url = `${origin}/${handle}`;

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard unavailable — the URL is visible to select manually */
    }
  }, [url]);

  return (
    <div className="text-left">
      <p className="text-fg-muted mt-3 text-center">
        Live. One identity, every surface:
      </p>

      <div className="mt-5 flex items-center gap-2 bg-ink-850 border border-ink-700 rounded-xl px-4 py-3">
        <span className="flex-1 font-mono text-sm text-accent-soft truncate">{url}</span>
        <button
          onClick={copy}
          className="shrink-0 rounded-lg border border-accent/50 text-accent-soft text-xs font-bold px-3 py-1.5 hover:bg-accent/10 transition"
        >
          {copied ? "✓ copied" : "copy"}
        </button>
      </div>

      <div className="mt-4 grid grid-cols-[auto_1fr] gap-4 items-center bg-ink-850 border border-ink-700 rounded-xl p-4">
        <img
          src={`/${handle}?format=qr`}
          alt={`QR code for ${handle}`}
          className="w-24 h-24 rounded-lg bg-white p-1"
        />
        <div>
          <p className="text-sm font-semibold text-fg">
            Print-grade QR — scans are tracked separately from taps.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <a
              href={`/${handle}?format=qr&download=1`}
              className="rounded-lg border border-ink-700 text-fg-muted text-xs font-bold px-3 py-1.5 hover:border-accent/50 hover:text-accent-soft transition"
            >
              ↓ SVG
            </a>
            <a
              href={`/${handle}?format=qr&type=png&download=1`}
              className="rounded-lg border border-ink-700 text-fg-muted text-xs font-bold px-3 py-1.5 hover:border-accent/50 hover:text-accent-soft transition"
            >
              ↓ PNG (1024px)
            </a>
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <a href={`/${handle}`} className="btn btn-primary !py-3">
          View profile
        </a>
        <a href={`/${handle}?format=card`} className="btn btn-accent-ghost !py-3">
          Business card
        </a>
        <a href={`/${handle}?format=vcard`} className="btn btn-secondary !py-3">
          Save contact (.vcf)
        </a>
        <a href={`/${handle}?format=json`} className="btn btn-secondary !py-3">
          JSON surface
        </a>
      </div>

      <a
        href={`/edit/${encodeURIComponent(identityId)}`}
        className="btn btn-secondary mt-3 w-full !py-3"
      >
        ✎ Edit page
      </a>

      <p className="mt-4 text-xs text-fg-subtle text-center">
        Every surface above is a renderer over the same Identity Manifest.
      </p>
    </div>
  );
}

export default function ClaimPage(): React.ReactElement {
  const cfg = useAppConfig();
  const emailMode = cfg?.authMode === "email";
  const templates = useMemo(() => listTemplates(), []);
  const [handle, setHandle] = useState("");
  const [availability, setAvailability] = useState<Availability>("idle");
  const [displayName, setDisplayName] = useState("");
  const [template, setTemplate] = useState<string>("creator");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [claimed, setClaimed] = useState<{ identityId: string; handle: string } | null>(null);
  const [published, setPublished] = useState(false);
  const [locked, setLocked] = useState(false);
  const [needsUpgrade, setNeedsUpgrade] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const normalized = handle.toLowerCase().trim();

  // Live availability — the claim experience begins here.
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (!normalized) {
      setAvailability("idle");
      return;
    }
    if (!isValidHandle(normalized)) {
      setAvailability("invalid");
      return;
    }
    setAvailability("checking");
    timer.current = setTimeout(async () => {
      try {
        const r = await fetch(`/api/handles/${encodeURIComponent(normalized)}/availability`);
        const j = (await r.json()) as { available: boolean };
        setAvailability(j.available ? "available" : "taken");
      } catch {
        setAvailability("idle");
      }
    }, 250);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [normalized]);

  const claim = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/identities", {
        method: "POST",
        headers: { "content-type": "application/json", ...adminHeaders() },
        body: JSON.stringify({
          handle: normalized,
          displayName: displayName || normalized,
          template,
        }),
      });
      if (r.status === 401) {
        setLocked(true);
        return;
      }
      if (r.status === 402) {
        // Free profile used — show the two-door upgrade.
        setNeedsUpgrade(true);
        return;
      }
      const j = (await r.json()) as {
        manifest?: { identityId: string; handle: string };
        error?: string;
      };
      if (!r.ok || !j.manifest) {
        setError(j.error ?? `claim failed (${r.status})`);
        return;
      }
      setClaimed({ identityId: j.manifest.identityId, handle: j.manifest.handle });
    } catch (err) {
      setError(err instanceof Error ? err.message : "claim failed");
    } finally {
      setBusy(false);
    }
  }, [normalized, displayName, template]);

  const publish = useCallback(async () => {
    if (!claimed) return;
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(`/api/identities/${encodeURIComponent(claimed.identityId)}/publish`, {
        method: "POST",
        headers: adminHeaders(),
      });
      if (r.status === 401) {
        setLocked(true);
        return;
      }
      if (!r.ok) {
        const j = (await r.json()) as { error?: string };
        setError(j.error ?? `publish failed (${r.status})`);
        return;
      }
      setPublished(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "publish failed");
    } finally {
      setBusy(false);
    }
  }, [claimed]);

  const badge: Record<Availability, React.ReactElement | null> = {
    idle: null,
    checking: <span className="text-fg-muted text-sm">checking…</span>,
    available: <span className="text-signal-green text-sm font-semibold">✓ available</span>,
    taken: <span className="text-signal-red text-sm font-semibold">taken</span>,
    invalid: <span className="text-signal-amber text-sm font-semibold">2–40 chars, a–z 0–9 -</span>,
  };

  return (
    <>
    <Nav />
    <main className="min-h-screen flex flex-col items-center px-5 py-16">
      <header className="text-center max-w-2xl animate-slide-up">
        <p className="font-mono text-xs tracking-widest text-accent-soft uppercase">
          NEDB stores knowledge · Portal renders experiences · Links publishes identity
        </p>
        <h1 className="chrome-text font-display text-4xl sm:text-6xl font-bold mt-4 leading-tight">
          One handle.
          <br />
          <span className="text-accent">Every surface.</span>
        </h1>
        <p className="text-fg-muted mt-4 text-lg">
          {emailMode
            ? "Your professional identity, actually yours. Claim your handle and publish everywhere — profile page, business card, QR code, vCard."
            : "Your professional identity, owned like a wallet. Claim your handle and publish everywhere — profile page, business card, QR code, vCard."}
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-2 text-[11px] font-mono uppercase tracking-wider">
          <span className="chip bg-ink-900 text-fg-subtle">{emailMode ? "free forever" : "no email required"}</span>
          <span className="chip bg-ink-900 text-fg-subtle">every edit versioned</span>
          <span className="chip bg-ink-900 text-fg-subtle">tamper-evident</span>
          <span className="chip bg-ink-900 text-fg-subtle">yours to self-host</span>
        </div>
      </header>

      {locked ? (
        <div className="w-full max-w-xl">
          <Gate
            onReady={() => {
              setLocked(false);
              // Continue the claim the user already started — no second click.
              void claim();
            }}
          />
        </div>
      ) : needsUpgrade ? (
        <div className="w-full max-w-xl mt-12">
          <UpgradeCard onUnlocked={() => setNeedsUpgrade(false)} />
        </div>
      ) : (
      <section className="w-full max-w-xl mt-12 panel p-6 sm:p-8 shadow-glow animate-fade-in">
        {!claimed ? (
          <>
            <label className="label">Claim your handle</label>
            <div className="field field-lg flex items-center gap-2 focus-within:!border-accent">
              <span className="text-fg-subtle font-mono">links/</span>
              <input
                value={handle}
                onChange={(e) => setHandle(e.target.value)}
                placeholder="marisayvettehair"
                autoFocus
                className="flex-1 bg-transparent outline-none font-mono text-lg text-fg placeholder:text-fg-faint min-w-0"
              />
              {badge[availability]}
            </div>

            <label className="label mt-6">Display name</label>
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Marisa Yvette"
              className="field field-lg"
            />

            <label className="label mt-6">Who are you?</label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {templates.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTemplate(t.id)}
                  title={t.description}
                  className={`rounded-xl border px-3 py-2.5 text-sm font-semibold transition ${
                    template === t.id
                      ? "border-accent bg-accent/10 text-accent-soft"
                      : "border-ink-700 bg-ink-850 text-fg-muted hover:bg-ink-800"
                  }`}
                >
                  {t.name}
                </button>
              ))}
            </div>

            <button
              onClick={claim}
              disabled={busy || availability !== "available"}
              className="btn btn-primary mt-8 w-full !py-3.5 !text-lg"
            >
              {busy ? "Claiming…" : "Claim it"}
            </button>
          </>
        ) : (
          <div className="text-center">
            <p className="font-mono text-xs uppercase tracking-widest text-signal-green">
              claimed
            </p>
            <h2 className="font-display text-3xl font-bold mt-2">@{claimed.handle}</h2>
            {!published ? (
              <>
                <p className="text-fg-muted mt-3">
                  Your draft is ready — the template seeded your page. Fill in your
                  links, then publish to go live.
                </p>
                <a
                  href={`/edit/${encodeURIComponent(claimed.identityId)}`}
                  className="btn btn-primary mt-6 w-full !py-3.5 !text-lg"
                >
                  Edit your draft →
                </a>
                <button
                  onClick={publish}
                  disabled={busy}
                  className="btn btn-accent-ghost mt-3 w-full !py-3"
                >
                  {busy ? "Publishing…" : "Publish as-is"}
                </button>
              </>
            ) : (
              <ShareKit handle={claimed.handle} identityId={claimed.identityId} />
            )}
          </div>
        )}

        {error && (
          <p className="mt-4 text-signal-red text-sm text-center font-mono">{error}</p>
        )}
      </section>
      )}

      <footer className="mt-16 text-center text-fg-subtle text-sm max-w-xl">
        <p className="font-semibold text-fg-muted">
          If we can build it, you can build it.
        </p>
        <p className="mt-2">
          Blocks, templates, and renderers are public extension APIs. Every built-in uses
          the same ones. GPLv3, self-hostable, one deployment.
        </p>
      </footer>
    </main>
    </>
  );
}

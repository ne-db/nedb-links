import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

import "../src/lib/blocks/builtin";
import "../src/lib/templates/builtin";
import { isValidHandle } from "../src/lib/identity";
import { listTemplates } from "../src/lib/registry";

export const intent = {
  purpose:
    "Claim-first onboarding: type a handle, see availability instantly, seed from a template, publish, share",
  primaryAction: "Claim a handle",
  seoKeyword: "link in bio identity platform",
};

type Availability = "idle" | "checking" | "available" | "taken" | "invalid";

function adminHeaders(): Record<string, string> {
  const token = localStorage.getItem("links-admin-token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export default function ClaimPage(): React.ReactElement {
  const templates = useMemo(() => listTemplates(), []);
  const [handle, setHandle] = useState("");
  const [availability, setAvailability] = useState<Availability>("idle");
  const [displayName, setDisplayName] = useState("");
  const [template, setTemplate] = useState<string>("creator");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [claimed, setClaimed] = useState<{ identityId: string; handle: string } | null>(null);
  const [published, setPublished] = useState(false);
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
    checking: <span className="text-slate-400 text-sm">checking…</span>,
    available: <span className="text-signal-green text-sm font-semibold">✓ available</span>,
    taken: <span className="text-signal-red text-sm font-semibold">taken</span>,
    invalid: <span className="text-signal-amber text-sm font-semibold">2–40 chars, a–z 0–9 -</span>,
  };

  return (
    <main className="min-h-screen flex flex-col items-center px-5 py-16">
      <header className="text-center max-w-2xl animate-slide-up">
        <p className="font-mono text-xs tracking-widest text-accent-soft uppercase">
          NEDB stores knowledge · Portal renders experiences · Links publishes identity
        </p>
        <h1 className="font-display text-4xl sm:text-6xl font-bold mt-4 leading-tight">
          One handle.
          <br />
          <span className="text-accent">Every surface.</span>
        </h1>
        <p className="text-slate-400 mt-4 text-lg">
          Claim your handle, publish your identity — profile page, business card, QR code,
          vCard, JSON. Versioned, tamper-evident, and yours to self-host.
        </p>
      </header>

      <section className="w-full max-w-xl mt-12 bg-ink-900 border border-ink-700 rounded-2xl p-6 sm:p-8 shadow-glow animate-fade-in">
        {!claimed ? (
          <>
            <label className="block font-mono text-xs uppercase tracking-widest text-slate-400">
              Claim your handle
            </label>
            <div className="mt-2 flex items-center gap-2 bg-ink-850 border border-ink-700 rounded-xl px-4 py-3 focus-within:border-accent/60">
              <span className="text-slate-500 font-mono">links/</span>
              <input
                value={handle}
                onChange={(e) => setHandle(e.target.value)}
                placeholder="marisayvettehair"
                autoFocus
                className="flex-1 bg-transparent outline-none font-mono text-lg text-slate-100 placeholder:text-slate-600"
              />
              {badge[availability]}
            </div>

            <label className="block font-mono text-xs uppercase tracking-widest text-slate-400 mt-6">
              Display name
            </label>
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Marisa Yvette"
              className="mt-2 w-full bg-ink-850 border border-ink-700 rounded-xl px-4 py-3 outline-none focus:border-accent/60 text-slate-100 placeholder:text-slate-600"
            />

            <label className="block font-mono text-xs uppercase tracking-widest text-slate-400 mt-6">
              Who are you?
            </label>
            <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-2">
              {templates.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTemplate(t.id)}
                  title={t.description}
                  className={`rounded-xl border px-3 py-2.5 text-sm font-semibold transition ${
                    template === t.id
                      ? "border-accent bg-accent/10 text-accent-soft"
                      : "border-ink-700 bg-ink-850 text-slate-300 hover:border-ink-700 hover:bg-ink-800"
                  }`}
                >
                  {t.name}
                </button>
              ))}
            </div>

            <button
              onClick={claim}
              disabled={busy || availability !== "available"}
              className="mt-8 w-full rounded-xl bg-accent text-ink-950 font-bold py-3.5 text-lg transition hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed"
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
                <p className="text-slate-400 mt-3">
                  Your identity is drafted from the template. Publish to go live.
                </p>
                <button
                  onClick={publish}
                  disabled={busy}
                  className="mt-6 w-full rounded-xl bg-accent text-ink-950 font-bold py-3.5 text-lg transition hover:brightness-110 disabled:opacity-40"
                >
                  {busy ? "Publishing…" : "Publish now"}
                </button>
              </>
            ) : (
              <>
                <p className="text-slate-400 mt-3">Live. Share it everywhere:</p>
                <a
                  href={`/${claimed.handle}`}
                  className="mt-6 block w-full rounded-xl border border-accent/50 text-accent-soft font-bold py-3.5 text-lg hover:bg-accent/10 transition"
                >
                  links/{claimed.handle} →
                </a>
                <a
                  href={`/${claimed.handle}?format=json`}
                  className="mt-3 block text-sm text-slate-400 underline underline-offset-4"
                >
                  the same identity as JSON — every surface is a renderer
                </a>
              </>
            )}
          </div>
        )}

        {error && (
          <p className="mt-4 text-signal-red text-sm text-center font-mono">{error}</p>
        )}
      </section>

      <footer className="mt-16 text-center text-slate-500 text-sm max-w-xl">
        <p className="font-semibold text-slate-400">
          If we can build it, you can build it.
        </p>
        <p className="mt-2">
          Blocks, templates, and renderers are public extension APIs. Every built-in uses
          the same ones. GPLv3, self-hostable, one deployment.
        </p>
      </footer>
    </main>
  );
}

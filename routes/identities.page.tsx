import React, { useCallback, useEffect, useState } from "react";
import { Link } from "@interchained/portal-react";

import { Nav } from "../src/components/Nav";
import { Footer } from "../src/components/Footer";
import { Gate } from "../src/components/Gate";
import { ApiError, getJson } from "../src/lib/api";

export const intent = {
  purpose:
    "Manage every identity this owner holds — personal, business, brand, event — each with its own handle and surfaces",
  primaryAction: "Open an identity in the editor",
  seoKeyword: "identity manager",
};

interface IdentitySummary {
  identityId: string;
  handle: string;
  displayName: string;
  identityType: string;
  template?: string;
  theme?: string;
  status: "draft" | "published";
  blockCount: number;
  publishedAt?: string;
  updatedAt: string;
}

export default function IdentitiesPage(): React.ReactElement {
  const [identities, setIdentities] = useState<IdentitySummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    setLocked(false);
    try {
      const j = await getJson<{ identities: IdentitySummary[] }>("/api/identities");
      setIdentities(j.identities);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setLocked(true);
        return;
      }
      setError(err instanceof Error ? err.message : "failed to load");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (locked) {
    return (
      <>
        <Nav />
        <Gate onReady={() => void load()} />
      </>
    );
  }

  return (
    <>
      <Nav />
      <main className="max-w-5xl mx-auto px-5 py-10">
        <header className="flex items-end justify-between">
          <div>
            <h1 className="font-display text-3xl font-bold">Identities</h1>
            <p className="text-fg-muted text-sm mt-1">
              One owner, many identities — each with its own handle and every surface.
            </p>
          </div>
          <Link href="/" className="btn btn-primary">
            + Claim a handle
          </Link>
        </header>

        {error && (
          <p className="mt-8 text-signal-red font-mono text-sm">{error}</p>
        )}

        {identities && identities.length === 0 && (
          <div className="mt-16 text-center text-fg-muted">
            <p className="text-4xl">⬡</p>
            <p className="mt-3 font-semibold text-fg-muted">No identities yet</p>
            <p className="text-sm mt-1">Claim a handle to publish your first one.</p>
          </div>
        )}

        <div className="mt-8 grid gap-3">
          {identities?.map((idn) => (
            <Link
              key={idn.identityId}
              href={`/edit/${idn.identityId}`}
              className="group panel panel-lift grid sm:grid-cols-[1fr_auto] gap-3 items-center px-5 py-4 hover:border-accent/40"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2.5">
                  <span className="font-bold text-lg truncate">{idn.displayName}</span>
                  <span
                    className={`chip ${
                      idn.status === "published"
                        ? "text-signal-green border-signal-green/40 bg-signal-green/10"
                        : "text-signal-amber border-signal-amber/40 bg-signal-amber/10"
                    }`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${idn.status === "published" ? "bg-signal-green" : "bg-signal-amber"}`} />
                    {idn.status === "published" ? "Live" : "Draft"}
                  </span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-fg-muted">
                  <span className="font-mono text-accent-soft">@{idn.handle}</span>
                  <span>{idn.identityType}</span>
                  {idn.template && <span>template: {idn.template}</span>}
                  <span>
                    {idn.blockCount} block{idn.blockCount === 1 ? "" : "s"}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2 text-sm font-semibold">
                <span
                  role="link"
                  tabIndex={0}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    window.location.href = `/analytics/${encodeURIComponent(idn.identityId)}`;
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") window.location.href = `/analytics/${encodeURIComponent(idn.identityId)}`;
                  }}
                  className="btn btn-ghost !py-1.5 !px-3"
                  title="Analytics"
                >
                  Stats
                </span>
                {idn.status === "published" && (
                  <a
                    href={`/${idn.handle}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="btn btn-secondary !py-1.5 !px-3"
                  >
                    View ↗
                  </a>
                )}
                <span className="btn btn-accent-ghost !py-1.5 !px-3 group-hover:bg-accent/10">
                  Edit
                </span>
              </div>
            </Link>
          ))}
        </div>
      </main>
      <Footer />
    </>
  );
}

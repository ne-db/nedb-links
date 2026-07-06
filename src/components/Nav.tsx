import React, { useEffect, useState } from "react";
import { Link } from "@interchained/portal-react";

import { clearSession, getAddress, getToken } from "../lib/api";
import { getTheme, nextTheme, THEME_LABELS, toggleTheme, type ThemeName } from "../lib/theme";

/** itc1qxy2k…x0wlh — inline (keeps wallet crypto out of the nav bundle). */
function shortAddr(addr: string): string {
  return addr.length <= 16 ? addr : `${addr.slice(0, 10)}…${addr.slice(-5)}`;
}

export function Nav(): React.ReactElement {
  const [address, setAddress] = useState<string | null>(null);
  const [theme, setTheme] = useState<ThemeName>("pro");

  useEffect(() => {
    setAddress(getAddress());
    setTheme(getTheme());
  }, []);

  return (
    <nav className="w-full border-b border-ink-800 bg-ink-900/85 backdrop-blur sticky top-0 z-20">
      <div className="max-w-7xl mx-auto px-5 h-14 flex items-center justify-between">
        <div className="flex items-center gap-6 min-w-0">
          <Link href="/" className="font-display font-bold text-lg tracking-tight text-fg shrink-0">
            <span className="text-accent">⬡</span> NEDB Links
          </Link>
          <Link
            href="/identities"
            className="hidden sm:inline text-sm font-medium text-fg-muted hover:text-fg transition"
          >
            Identities
          </Link>
        </div>
        <div className="flex items-center gap-2 sm:gap-3 text-sm">
          <Link href="/" className="btn btn-primary !py-1.5 !px-3.5">
            Claim
          </Link>
          <button
            onClick={() => setTheme(toggleTheme())}
            className="chip font-mono text-[10px] uppercase tracking-widest text-fg-subtle hover:text-accent-soft hover:border-accent/40 transition"
            title={`Theme: ${theme} — click for ${nextTheme(theme)}`}
          >
            {THEME_LABELS[theme]}
          </button>
          {address && (
            <div className="flex items-center gap-2">
              <span
                className="hidden md:inline-flex chip font-mono text-[11px] text-fg-muted"
                title={address}
              >
                {shortAddr(address)}
              </span>
              <button
                onClick={() => {
                  void fetch("/api/auth/logout", {
                    method: "POST",
                    headers: { authorization: `Bearer ${getToken() ?? ""}` },
                  }).catch(() => undefined);
                  clearSession();
                  window.location.href = "/";
                }}
                className="text-fg-subtle hover:text-signal-red transition text-xs font-medium"
                title="Sign out"
              >
                Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}

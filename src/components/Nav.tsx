import React, { useEffect, useState } from "react";
import { Link } from "@interchained/portal-react";

import { clearSession, getAddress, getEmail, getToken } from "../lib/api";
import { getTheme, nextTheme, THEME_LABELS, toggleTheme, type ThemeName } from "../lib/theme";

/** itc1qxy2k…x0wlh — inline (keeps wallet crypto out of the nav bundle). */
function shortAddr(addr: string): string {
  return addr.length <= 16 ? addr : `${addr.slice(0, 10)}…${addr.slice(-5)}`;
}

/**
 * THE nav — singular by design. Pages don't stack second bars under it;
 * they project into it:
 *
 *   context  — identity of the current surface (back arrow, name,
 *              @handle, status chip), rendered beside the wordmark.
 *   actions  — the surface's commands (Save, Publish, Refresh…),
 *              rendered on the right where Claim normally lives.
 *
 * One sticky element, 48px, everywhere. The Linear/Vercel pattern from
 * Mark's Signal brief: "NEDB Links | Identities | … Save Publish".
 */
export function Nav({
  context,
  actions,
}: {
  context?: React.ReactNode;
  actions?: React.ReactNode;
} = {}): React.ReactElement {
  const [address, setAddress] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [theme, setTheme] = useState<ThemeName>("pro");

  useEffect(() => {
    setAddress(getAddress());
    setEmail(getEmail());
    setTheme(getTheme());
  }, []);

  return (
    <nav className="streamline w-full border-b border-ink-800 bg-ink-900/85 backdrop-blur sticky top-0 z-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-5 h-12 flex items-center gap-3 justify-between">
        <div className="flex items-center gap-3 sm:gap-4 min-w-0">
          <Link href="/" className="font-display font-bold text-lg tracking-tight text-fg shrink-0" title="NEDB Links">
            <span className="text-accent">⬡</span>
            <span className={context ? "hidden lg:inline" : ""}> NEDB Links</span>
          </Link>
          {!context && (
            <Link
              href="/identities"
              className="hidden sm:inline text-sm font-medium text-fg-muted hover:text-fg transition"
            >
              Identities
            </Link>
          )}
          {context && (
            <>
              <span className="h-5 w-px bg-ink-800 shrink-0" aria-hidden />
              <div className="flex items-center gap-2.5 min-w-0">{context}</div>
            </>
          )}
        </div>
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {actions ?? (
            <Link href="/" className="btn btn-primary !py-1.5 !px-3.5">
              Claim
            </Link>
          )}
          <button
            onClick={() => setTheme(toggleTheme())}
            className="chip font-mono text-[10px] uppercase tracking-widest text-fg-subtle hover:text-accent-soft hover:border-accent/40 transition"
            title={`Theme: ${theme} — click for ${nextTheme(theme)}`}
          >
            {THEME_LABELS[theme]}
          </button>
          {address && (
            <div className="hidden md:flex items-center gap-2">
              <span
                className={`chip text-[11px] text-fg-muted ${email ? "" : "font-mono"}`}
                title={email ?? address}
              >
                {email ?? shortAddr(address)}
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

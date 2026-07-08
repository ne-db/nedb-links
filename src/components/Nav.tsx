import React, { useEffect, useState } from "react";
import { Link } from "@interchained/portal-react";

import { clearSession, getAddress, getEmail, getToken } from "../lib/api";
import { useAppConfig } from "../lib/useAppConfig";
import { applyTheme, getStoredTheme, getTheme, isThemeName } from "../lib/theme";

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
  const cfg = useAppConfig();
  const brand = cfg?.brandName ?? "NEDB Links";
  const [address, setAddress] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    setAddress(getAddress());
    setEmail(getEmail());
  }, []);

  // Dev parity: prod injects the deployment default pre-paint; in dev
  // (no injection) apply it once the config lands — but never override
  // a theme the user explicitly picked.
  useEffect(() => {
    if (!cfg) return;
    if (getStoredTheme()) return;
    if (isThemeName(cfg.defaultTheme) && cfg.defaultTheme !== getTheme()) {
      applyTheme(cfg.defaultTheme);
      try {
        localStorage.removeItem("links-theme"); // applyTheme stored it; a default is not a choice
      } catch { /* fine */ }
    }
    if (cfg.brandName && cfg.brandName !== "NEDB Links" && document.title.includes("NEDB Links")) {
      document.title = document.title.replace("NEDB Links", cfg.brandName);
    }
  }, [cfg]);

  return (
    <nav className="streamline w-full border-b border-ink-800 bg-ink-900/85 backdrop-blur sticky top-0 z-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-5 h-12 flex items-center gap-3 justify-between">
        <div className="flex items-center gap-3 sm:gap-4 min-w-0">
          <Link href="/" className="font-display font-bold text-lg tracking-tight text-fg shrink-0 inline-flex items-center gap-2" title={brand}>
            {cfg?.brandLogoUrl ? (
              <img src={cfg.brandLogoUrl} alt="" className="h-6 w-6 object-contain" />
            ) : (
              <span className="text-accent">⬡</span>
            )}
            <span className={context ? "hidden lg:inline" : ""}>{brand}</span>
          </Link>
          {!context && (
            <>
              <Link
                href="/identities"
                className="hidden sm:inline text-sm font-medium text-fg-muted hover:text-fg transition"
              >
                Identities
              </Link>
              {/* Server route, not SPA — a hard link is correct. */}
              <a
                href="/discover"
                className="hidden sm:inline text-sm font-medium text-fg-muted hover:text-fg transition"
              >
                Discover
              </a>
            </>
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

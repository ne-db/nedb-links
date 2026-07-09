import React, { useEffect, useState } from "react";
import { Link } from "@interchained/portal-react";
import { Crown } from "lucide-react";

import { getAddress, getEmail, onSessionChanged } from "../lib/api";
import { useAppConfig } from "../lib/useAppConfig";
import { useBillingStatus } from "../lib/useBillingStatus";
import { requestUpgrade } from "../lib/upgrade";
import { NavMenu } from "./NavMenu";
import { PremiumStatusModal } from "./PremiumModals";
import { SubNav } from "./SubNav";
import { UpgradeModal } from "./UpgradeModal";
import { WelcomeToast } from "./WelcomeToast";
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
 *
 * ONE earned exception (Mark's call, July 8 — "logged in only, on
 * scroll hide"): the signed-in strip (SubNav), a second row that only
 * exists for owners, carries their live numbers, ducks on scroll-down
 * and returns on scroll-up. Visitors still get the single bar; readers
 * never pay its height.
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
  const { status: billing } = useBillingStatus();
  const [showStatus, setShowStatus] = useState(false);

  // Mount AND session-phase changes: signing in at a gate (no
  // navigation) flips the account chip live; signing out clears it.
  useEffect(() => {
    const read = (): void => {
      setAddress(getAddress());
      setEmail(getEmail());
    };
    read();
    return onSessionChanged(read);
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
          {/* The business side, never buried — but never static either.
              Two real states: the upsell ghost chip pre-premium, a
              solid brand-ramp BADGE post-premium. Gating on billing.
              unlimited (not just limitEnabled+address) is the actual
              fix — the chip used to render identically before and
              after a real Stripe checkout succeeded. */}
          {cfg?.limitEnabled && address && billing?.unlimited && (
            <button
              onClick={() => setShowStatus(true)}
              className="premium-badge rounded-full px-3 py-1 text-[11px] font-bold inline-flex items-center gap-1"
              title="You're Premium — tap to see your perks"
            >
              <Crown size={11} fill="currentColor" />
              Premium
            </button>
          )}
          {cfg?.limitEnabled && address && billing && !billing.unlimited && (
            <button
              onClick={() => requestUpgrade("generic")}
              className="chip text-[11px] font-semibold text-accent-soft hover:border-accent/50 transition"
              title="Go Premium — galleries, the QR studio, custom SEO, giveaways, Discover, fonts, more profiles"
            >
              ✨ Premium
            </button>
          )}
          {/* Signed out: the Claim hero — the product's front door.
              Signed in: the nav gets QUIETER — Claim retires (it lives
              on the dashboard and in the menu) and "everything else"
              folds into the hamburger: identity, nav links (finally
              reachable on phones), premium, sign out. Pages that
              project actions (the editor) still own this slot. */}
          {actions ??
            (address ? (
              <NavMenu
                who={email ?? shortAddr(address)}
                premium={billing?.unlimited ? "premium" : "free"}
                showPremium={Boolean(cfg?.limitEnabled && billing)}
                onPremium={() =>
                  billing?.unlimited ? setShowStatus(true) : requestUpgrade("generic")
                }
              />
            ) : (
              <Link href="/" className="btn btn-primary !py-1.5 !px-3.5">
                Claim
              </Link>
            ))}
        </div>
      </div>
      <SubNav />
      <UpgradeModal />
      <WelcomeToast />
      {showStatus && billing?.unlimited && (
        <PremiumStatusModal status={billing} onClose={() => setShowStatus(false)} />
      )}
    </nav>
  );
}

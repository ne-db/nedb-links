import React, { useEffect, useState } from "react";
import { Link } from "@interchained/portal-react";

import { useAppConfig } from "../lib/useAppConfig";
import { getTheme, nextTheme, THEME_LABELS, toggleTheme, type ThemeName } from "../lib/theme";

/**
 * The app footer — quiet, uniform, and now the home of the theme
 * switcher (moved out of the nav to keep the top bar lean on phones).
 * Brand mark · Discover · theme cycler. That's it.
 */
export function Footer(): React.ReactElement {
  const cfg = useAppConfig();
  const brand = cfg?.brandName ?? "NEDB Links";
  const [theme, setTheme] = useState<ThemeName>("pro");

  useEffect(() => {
    setTheme(getTheme());
  }, []);

  return (
    <footer className="mt-16 border-t border-ink-800 py-8">
      <div className="max-w-7xl mx-auto px-5 flex flex-wrap items-center justify-center gap-x-4 gap-y-3 text-xs text-fg-subtle">
        <Link href="/" className="font-display font-bold text-fg-muted hover:text-fg transition" title={brand}>
          <span className="text-accent">⬡</span> {brand}
        </Link>
        <span className="h-3 w-px bg-ink-800" aria-hidden />
        <a href="/discover" className="font-medium hover:text-fg transition">
          Discover
        </a>
        <span className="h-3 w-px bg-ink-800" aria-hidden />
        <button
          onClick={() => setTheme(toggleTheme())}
          className="chip font-mono text-[10px] uppercase tracking-widest text-fg-subtle hover:text-accent-soft hover:border-accent/40 transition"
          title={`Theme: ${theme} — click for ${nextTheme(theme)}`}
        >
          {THEME_LABELS[theme]}
        </button>
      </div>
    </footer>
  );
}

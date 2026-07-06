/**
 * App themes — three registers, one DOM.
 *   pro    — light, professional-network trust (default; normies first)
 *   native — sovereign dark, electric cyan (the crypto crowd)
 *   v3     — "Signal": the publishing studio. Editorial light, one strong
 *            blue, elevated cards, Inter Tight. Less dashboard, more app.
 *
 * Persisted per browser; restored before first paint by index.html.
 */

export const THEME_ORDER = ["pro", "native", "v3"] as const;
export type ThemeName = (typeof THEME_ORDER)[number];

export const THEME_LABELS: Record<ThemeName, string> = {
  pro: "○ pro",
  native: "◆ native",
  v3: "✦ signal",
};

export const THEME_KEY = "links-theme";

export function isThemeName(t: unknown): t is ThemeName {
  return typeof t === "string" && (THEME_ORDER as readonly string[]).includes(t);
}

/** Pure cycle: pro → native → v3 → pro. Exported for tests. */
export function nextTheme(t: ThemeName): ThemeName {
  const i = THEME_ORDER.indexOf(t);
  return THEME_ORDER[(i + 1) % THEME_ORDER.length];
}

export function getTheme(): ThemeName {
  try {
    const t = localStorage.getItem(THEME_KEY);
    return isThemeName(t) ? t : "pro";
  } catch {
    return "pro";
  }
}

export function applyTheme(theme: ThemeName): void {
  const root = document.documentElement;
  // 250ms crossfade — the transition class is scoped to the flip so the
  // rest of the app never pays for blanket transitions.
  root.classList.add("theme-fade");
  root.setAttribute("data-theme", theme);
  window.setTimeout(() => root.classList.remove("theme-fade"), 300);
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    /* storage unavailable — theme applies for this page only */
  }
}

export function toggleTheme(): ThemeName {
  const next = nextTheme(getTheme());
  applyTheme(next);
  return next;
}

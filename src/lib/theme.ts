/**
 * Dual theme — LinkedIn for web3.
 *   pro    — light, professional-network trust (default; normies first)
 *   native — sovereign dark, electric cyan (the crypto crowd)
 *
 * Persisted per browser; restored before first paint by index.html.
 */

export type ThemeName = "pro" | "native";

export const THEME_KEY = "links-theme";

export function getTheme(): ThemeName {
  try {
    const t = localStorage.getItem(THEME_KEY);
    return t === "native" ? "native" : "pro";
  } catch {
    return "pro";
  }
}

export function applyTheme(theme: ThemeName): void {
  document.documentElement.setAttribute("data-theme", theme);
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    /* storage unavailable — theme applies for this page only */
  }
}

export function toggleTheme(): ThemeName {
  const next: ThemeName = getTheme() === "pro" ? "native" : "pro";
  applyTheme(next);
  return next;
}

export type Theme = "light" | "dark";

export const THEME_STORAGE_KEY = "calsie-theme";

export function isTheme(value: unknown): value is Theme {
  return value === "light" || value === "dark";
}

/**
 * Runs before first paint (injected into <head>) so the stored theme is
 * applied to <html> before the browser paints anything — without this the
 * page renders light, then snaps to dark on hydration.
 *
 * When nothing is stored the attribute is deliberately left unset so the
 * CSS `prefers-color-scheme` rules stay in charge and the UI follows the OS.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem("${THEME_STORAGE_KEY}");if(t==="dark"||t==="light"){document.documentElement.setAttribute("data-theme",t);}}catch(e){}})();`;

export function readStoredTheme(): Theme | null {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return isTheme(stored) ? stored : null;
  } catch {
    return null;
  }
}

export function systemTheme(): Theme {
  return typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

export function applyTheme(theme: Theme) {
  document.documentElement.setAttribute("data-theme", theme);
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    /* storage can be unavailable (private mode, blocked cookies) — the
       in-page theme still applies, it just will not persist. */
  }
}

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

/**
 * Fired on `window` after the theme changes, so every control in THIS
 * document can re-read it. The `storage` event deliberately does not fire in
 * the document that wrote the value, so without this the topbar toggle and
 * the profile screen's appearance picker would disagree after either one is
 * used — each would still be showing the value it last set itself.
 */
export const THEME_CHANGE_EVENT = "calsie:theme-change";

function notifyThemeChange() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
}

export function applyTheme(theme: Theme) {
  document.documentElement.setAttribute("data-theme", theme);
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    /* storage can be unavailable (private mode, blocked cookies) — the
       in-page theme still applies, it just will not persist. */
  }
  notifyThemeChange();
}

/* ---------------------------------------------------------------
   Three-state preference: light / dark / system.

   "system" is not a third value written to storage — it is the
   *absence* of a stored value, which is exactly the state
   THEME_INIT_SCRIPT already documents as "let prefers-color-scheme
   stay in charge". Until now nothing could return to that state
   once a user had picked light or dark.
   --------------------------------------------------------------- */

export type ThemePreference = Theme | "system";

export function isThemePreference(value: unknown): value is ThemePreference {
  return isTheme(value) || value === "system";
}

/** The stored preference, or "system" when nothing (valid) is stored. */
export function readThemePreference(): ThemePreference {
  return readStoredTheme() ?? "system";
}

/** Clears the explicit choice so the OS preference takes over again. */
export function clearStoredTheme() {
  document.documentElement.removeAttribute("data-theme");
  try {
    localStorage.removeItem(THEME_STORAGE_KEY);
  } catch {
    /* see applyTheme */
  }
  notifyThemeChange();
}

/** Applies a light/dark/system preference and persists it. */
export function applyThemePreference(preference: ThemePreference) {
  if (preference === "system") {
    clearStoredTheme();
    return;
  }
  applyTheme(preference);
}

/** The theme actually rendered for a preference — resolves "system". */
export function resolveThemePreference(preference: ThemePreference): Theme {
  return preference === "system" ? systemTheme() : preference;
}

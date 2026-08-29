"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { applyTheme, readStoredTheme, systemTheme, THEME_STORAGE_KEY, type Theme } from "../../lib/theme";

export default function ThemeToggle() {
  // Starts null so the server render and the first client render agree; the
  // real value lands in the effect below, after hydration.
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    setTheme(readStoredTheme() ?? systemTheme());
  }, []);

  // While the user has made no explicit choice, keep following the OS.
  useEffect(() => {
    if (readStoredTheme()) return;
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (event: MediaQueryListEvent) => setTheme(event.matches ? "dark" : "light");
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  // Mirror the choice across other open tabs.
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== THEME_STORAGE_KEY) return;
      const next = event.newValue;
      if (next === "dark" || next === "light") {
        setTheme(next);
        document.documentElement.setAttribute("data-theme", next);
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const isDark = theme === "dark";

  return (
    <button
      type="button"
      className="ws-icon-btn"
      aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
      title={isDark ? "Switch to light theme" : "Switch to dark theme"}
      onClick={() => {
        const next: Theme = isDark ? "light" : "dark";
        setTheme(next);
        applyTheme(next);
      }}
    >
      {isDark ? <Sun size={19} strokeWidth={1.9} /> : <Moon size={19} strokeWidth={1.9} />}
    </button>
  );
}

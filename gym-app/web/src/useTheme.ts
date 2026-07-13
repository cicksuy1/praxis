// Light/dark theme: follow the OS on first visit, then persist a manual override.
// The chosen theme is reflected as `data-theme` on <html>; index.css keys its
// light palette off `:root[data-theme="light"]`. A no-flash inline script in
// index.html applies the same logic before paint — this hook keeps React in sync.
import { useCallback, useEffect, useState } from "react";

export type Theme = "light" | "dark";

const KEY = "gym-theme";
const LIGHT_QUERY = "(prefers-color-scheme: light)";

function systemTheme(): Theme {
  return window.matchMedia(LIGHT_QUERY).matches ? "light" : "dark";
}

/** The initial theme: a stored manual choice if present, else the OS preference. */
export function getInitialTheme(): Theme {
  const stored = localStorage.getItem(KEY);
  return stored === "light" || stored === "dark" ? stored : systemTheme();
}

export function useTheme(): { theme: Theme; toggle: () => void } {
  const [theme, setTheme] = useState<Theme>(getInitialTheme);

  // Reflect the current theme onto <html> for the CSS to key off.
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  // While the user hasn't made a manual choice, follow live OS changes.
  useEffect(() => {
    if (localStorage.getItem(KEY)) return;
    const mq = window.matchMedia(LIGHT_QUERY);
    const onChange = (e: MediaQueryListEvent) => setTheme(e.matches ? "light" : "dark");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [theme]);

  const toggle = useCallback(() => {
    setTheme((prev) => {
      const next: Theme = prev === "dark" ? "light" : "dark";
      localStorage.setItem(KEY, next); // a manual choice now wins over the OS
      return next;
    });
  }, []);

  return { theme, toggle };
}

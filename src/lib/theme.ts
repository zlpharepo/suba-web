import { useEffect, useState } from "react";

const KEY = "suba.theme";

function initial(): boolean {
  const stored = localStorage.getItem(KEY);
  if (stored) return stored === "dark";
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

/** Applied before React renders, so the first paint is already in the right theme. */
export function applyStoredTheme() {
  document.documentElement.classList.toggle("dark", initial());
}

export function useTheme() {
  const [dark, setDark] = useState(initial);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);

  return {
    dark,
    toggle: () => {
      const next = !dark;
      localStorage.setItem(KEY, next ? "dark" : "light");
      setDark(next);
    },
  };
}

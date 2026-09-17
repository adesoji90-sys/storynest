import { useEffect, useState } from "react";

// A real, user-controlled toggle — not just following the OS's own
// light/dark setting with no override. Reads the CURRENT state from
// the <html> element's class on mount (already set correctly before
// this even renders, by the inline script in _document.js — see that
// file's own comment for why that has to run synchronously before
// paint), then just flips the class and persists the choice on click.
export default function ThemeToggle({ className = "" }) {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    setIsDark(document.documentElement.classList.contains("dark"));
  }, []);

  function toggle() {
    const next = !isDark;
    setIsDark(next);
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("theme", next ? "dark" : "light");
    } catch {
      // localStorage can throw in some private-browsing modes — the
      // toggle still works for the current page view either way, it
      // just won't be remembered on the next visit.
    }
  }

  return (
    <button
      onClick={toggle}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      className={`flex h-9 w-9 items-center justify-center rounded-full border border-charcoal/15 text-sm ${className}`}
    >
      {isDark ? "☀️" : "🌙"}
    </button>
  );
}

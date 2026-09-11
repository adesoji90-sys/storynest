// Reading Mode — a client-side-only lock that restricts the app to one
// child's reading experience. This is NOT server-enforced security (the
// underlying session is still the parent's Supabase login the whole
// time) — it's a UI restriction sized to the actual problem: a young
// child shouldn't be able to wander into Story Studio or family
// settings, not a defense against a determined bypass attempt. See the
// exit-gate math challenge for the same reasoning.
//
// sessionStorage (not localStorage) is deliberate — closing the tab or
// browser exits Reading Mode automatically, which is the safer default
// for a shared family device.

const KEY = "storynest_reading_mode_child_id";

export function getReadingModeChildId() {
  if (typeof window === "undefined") return null;
  return window.sessionStorage.getItem(KEY);
}

export function enterReadingMode(childId) {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(KEY, childId);
}

export function exitReadingMode() {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(KEY);
}

// Routes reachable while Reading Mode is active. Everything else
// redirects back to /reading-mode — this is the actual enforcement
// point, not just which links are shown in the UI, since a child could
// otherwise just type a URL directly.
export function isAllowedInReadingMode(pathname) {
  return (
    pathname === "/reading-mode" ||
    pathname.startsWith("/read/") ||
    pathname === "/login" // safety valve: never trap someone on a broken session
  );
}

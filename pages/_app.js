import { useEffect } from "react";
import { useRouter } from "next/router";
import "@/styles/globals.css";
import { supabaseBrowser } from "@/lib/supabaseBrowserClient";
import { getReadingModeChildId, isAllowedInReadingMode } from "@/lib/readingMode";

export default function App({ Component, pageProps }) {
  const router = useRouter();

  // One global listener for the whole app, rather than each page
  // re-implementing its own sign-in handling — every page that needs a
  // session already reads it independently (see checkout.js,
  // premium-builder.js, subscribe.js, account.js), so this doesn't
  // replace that; it just guarantees the Family/User bootstrap runs
  // exactly once per actual sign-in, regardless of which page someone
  // happens to land on after clicking their magic link.
  //
  // Deliberately fire-and-forget: a failure here shouldn't block the
  // page the user is trying to use. If bootstrap fails, page-level
  // Family/Child lookups later will come back empty and prompt the
  // relevant flow, rather than the whole app being stuck on this call
  // succeeding first.
  useEffect(() => {
    const { data: listener } = supabaseBrowser.auth.onAuthStateChange((event, session) => {
      if (event !== "SIGNED_IN" || !session?.access_token) return;
      fetch("/api/auth/bootstrap", {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
      }).catch((err) => console.error("Auth bootstrap request failed:", err));
    });
    return () => listener?.subscription?.unsubscribe();
  }, []);

  // Reading Mode enforcement — the actual gate, not just which links the
  // UI happens to show. Checked on every route change (not just once on
  // load) so typing a URL directly, or the child using the browser's
  // own back/forward buttons, still gets redirected back. See
  // lib/readingMode.js for why this is a client-side UI restriction
  // sized to "a curious young child," not a real security boundary.
  useEffect(() => {
    function guard(url) {
      const childId = getReadingModeChildId();
      if (!childId) return;
      const pathname = url.split("?")[0];
      if (!isAllowedInReadingMode(pathname)) {
        router.replace("/reading-mode");
      }
    }
    guard(router.pathname);
    router.events.on("routeChangeStart", guard);
    return () => router.events.off("routeChangeStart", guard);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <Component {...pageProps} />;
}

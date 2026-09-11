import { useEffect } from "react";
import "@/styles/globals.css";
import { supabaseBrowser } from "@/lib/supabaseBrowserClient";

export default function App({ Component, pageProps }) {
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

  return <Component {...pageProps} />;
}

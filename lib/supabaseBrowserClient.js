// Browser-side Supabase client — used for auth only (magic-link sign-in,
// session checks). All data reads/writes still go through server-side API
// routes using the service-role key; this client never touches the
// database directly, so its permissions are limited to whatever RLS
// policies allow an authenticated user to do (currently: read their own
// profile/stories — see supabase/schema.sql).

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    "Supabase env vars are missing. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to .env.local"
  );
}

// Fall back to harmless placeholders when env vars are absent, rather than
// letting createClient() throw. That throw happens at *import time*, which
// crashes Next.js's build-time page data collection for every page that
// imports this file (login, account, subscribe, checkout) even though none
// of them actually call Supabase during the build — only real login
// attempts in the browser need the real values, and those still fail
// loudly (with a real auth error) if the placeholders are still in place.
export const supabaseBrowser = createClient(
  supabaseUrl || "https://placeholder.supabase.co",
  supabaseAnonKey || "placeholder-anon-key",
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true, // picks up the magic-link token from the URL on redirect back
    },
  }
);

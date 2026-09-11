import { useEffect, useState } from "react";
import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { supabaseBrowser } from "@/lib/supabaseBrowserClient";

// Landing page for the link sent by supabase.auth.resetPasswordForEmail
// (see login.js's "Forgot password?" flow). Supabase's client library
// automatically establishes a temporary "recovery" session from the
// link's URL fragment when this page loads — this page's only job is to
// let the person set a new password while that recovery session is
// active, via supabase.auth.updateUser(), then send them on to sign in
// normally with it.
export default function ResetPassword() {
  const router = useRouter();
  const [ready, setReady] = useState(false); // recovery session confirmed present
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    // PASSWORD_RECOVERY fires once Supabase has parsed the reset link's
    // token from the URL and established the temporary session — only
    // after that has this page actually got something to act on.
    const { data: listener } = supabaseBrowser.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setReady(true);
    });
    // Also check directly in case the event already fired before this
    // listener attached (a real timing possibility on initial page load).
    supabaseBrowser.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
    });
    return () => listener?.subscription?.unsubscribe();
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    if (password.length < 8) return setError("Password must be at least 8 characters.");
    if (password !== confirmPassword) return setError("Passwords don't match.");
    setError("");
    setSaving(true);
    const { error: err } = await supabaseBrowser.auth.updateUser({ password });
    setSaving(false);
    if (err) return setError(err.message || "Couldn't update the password — try again.");
    setDone(true);
    setTimeout(() => router.push("/account"), 2000);
  }

  return (
    <>
      <Head>
        <title>Reset password — StoryNest</title>
      </Head>
      <main className="flex min-h-screen flex-col items-center justify-center bg-ivory_cloth px-6 text-charcoal">
        <Link href="/" className="mb-8 font-display text-2xl">StoryNest</Link>
        <div className="w-full max-w-sm rounded-cloth bg-white p-8 shadow-sm">
          {done ? (
            <>
              <h1 className="font-display text-2xl">Password updated</h1>
              <p className="mt-2 font-body text-sm text-charcoal/70">Taking you to your account…</p>
            </>
          ) : !ready ? (
            <>
              <h1 className="font-display text-2xl">Confirming your link…</h1>
              <p className="mt-2 font-body text-sm text-charcoal/70">
                If this doesn't update in a few seconds, the reset link may have expired — request a new one from
                the <Link href="/login" className="underline">login page</Link>.
              </p>
            </>
          ) : (
            <>
              <h1 className="font-display text-2xl">Choose a new password</h1>
              <form onSubmit={handleSubmit}>
                <label className="mt-4 block font-body font-semibold">New password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 8 characters"
                  className="mt-1 w-full rounded-cloth border border-charcoal/15 bg-white px-4 py-2 font-body"
                />
                <label className="mt-4 block font-body font-semibold">Confirm new password</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="At least 8 characters"
                  className="mt-1 w-full rounded-cloth border border-charcoal/15 bg-white px-4 py-2 font-body"
                />
                {error && <p className="mt-1 font-body text-sm text-coral_ember">{error}</p>}
                <button
                  type="submit"
                  disabled={saving}
                  className="mt-6 w-full rounded-cloth bg-coral_ember px-6 py-3 font-body font-bold text-white disabled:opacity-50"
                >
                  {saving ? "Saving…" : "Update password"}
                </button>
              </form>
            </>
          )}
        </div>
      </main>
    </>
  );
}

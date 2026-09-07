import { useState } from "react";
import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { supabaseBrowser } from "@/lib/supabaseBrowserClient";

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      setError("Enter a valid email.");
      return;
    }
    setError("");
    setSending(true);
    const redirectPath = typeof router.query.redirect === "string" ? router.query.redirect : "/account";
    const { error: signInError } = await supabaseBrowser.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo:
          typeof window !== "undefined" ? `${window.location.origin}${redirectPath}` : undefined,
      },
    });
    setSending(false);
    if (signInError) {
      setError(signInError.message || "Couldn't send the link — try again.");
      return;
    }
    setSent(true);
  }

  return (
    <>
      <Head>
        <title>Log in — StoryNest</title>
      </Head>
      <main className="flex min-h-screen flex-col items-center justify-center bg-ivory_cloth px-6 text-charcoal">
        <Link href="/" className="mb-8 font-display text-2xl">StoryNest</Link>
        <div className="w-full max-w-sm rounded-cloth bg-white p-8 shadow-sm">
          {sent ? (
            <>
              <h1 className="font-display text-2xl">Check your email</h1>
              <p className="mt-2 font-body text-sm text-charcoal/70">
                We sent a sign-in link to {email}. Open it on this device to finish logging in.
              </p>
            </>
          ) : (
            <>
              <h1 className="font-display text-2xl">Log in</h1>
              <p className="mt-2 font-body text-sm text-charcoal/70">
                No password needed — we'll email you a link. This is only needed for a StoryNest subscription or to
                see your saved library; one-off stories don't require an account.
              </p>
              <form onSubmit={handleSubmit}>
                <label className="mt-6 block font-body font-semibold">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="mt-1 w-full rounded-cloth border border-charcoal/15 bg-white px-4 py-2 font-body"
                />
                {error && <p className="mt-1 font-body text-sm text-coral_ember">{error}</p>}
                <button
                  type="submit"
                  disabled={sending}
                  className="mt-6 w-full rounded-cloth bg-coral_ember px-6 py-3 font-body font-bold text-white disabled:opacity-50"
                >
                  {sending ? "Sending…" : "Send sign-in link"}
                </button>
              </form>
            </>
          )}
        </div>
      </main>
    </>
  );
}

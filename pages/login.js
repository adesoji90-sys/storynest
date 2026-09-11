import { useState } from "react";
import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { supabaseBrowser } from "@/lib/supabaseBrowserClient";

const EMAIL_RE = /^\S+@\S+\.\S+$/;

export default function Login() {
  const router = useRouter();
  const redirectPath = typeof router.query.redirect === "string" ? router.query.redirect : "/account";
  const redirectUrl = (path) => (typeof window !== "undefined" ? `${window.location.origin}${path}` : undefined);

  // Two independent choices, both always visible — which METHOD (password
  // vs magic link), and within password, which ACTION (sign in vs create
  // an account). The person picks both every time; nothing is hidden
  // behind a prior choice or account state, since guessing "this email
  // probably already has an account" client-side would mean silently
  // leaking whether an email is registered.
  const [method, setMethod] = useState("password"); // "password" | "magiclink"
  const [action, setAction] = useState("signin"); // "signin" | "signup" — password method only
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(null); // null | "magiclink" | "signup" | "reset"
  const [error, setError] = useState("");

  function resetMessages() {
    setError("");
    setSent(null);
  }

  async function handleMagicLink(e) {
    e.preventDefault();
    if (!EMAIL_RE.test(email)) return setError("Enter a valid email.");
    resetMessages();
    setSending(true);
    const { error: err } = await supabaseBrowser.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: redirectUrl(redirectPath) },
    });
    setSending(false);
    if (err) return setError(err.message || "Couldn't send the link — try again.");
    setSent("magiclink");
  }

  async function handlePasswordSignIn(e) {
    e.preventDefault();
    if (!EMAIL_RE.test(email)) return setError("Enter a valid email.");
    if (!password) return setError("Enter your password.");
    resetMessages();
    setSending(true);
    const { error: err } = await supabaseBrowser.auth.signInWithPassword({ email, password });
    setSending(false);
    if (err) {
      // Supabase returns the same generic message whether the password is
      // wrong or the account doesn't exist at all — deliberately, so this
      // page never reveals which emails are registered. The "create an
      // account instead" link below is the intended next step either way,
      // not a claim that we've detected the account is missing.
      setError(err.message || "Couldn't sign in — check your email and password.");
      return;
    }
    router.push(redirectPath);
  }

  async function handlePasswordSignUp(e) {
    e.preventDefault();
    if (!EMAIL_RE.test(email)) return setError("Enter a valid email.");
    if (password.length < 8) return setError("Password must be at least 8 characters.");
    if (password !== confirmPassword) return setError("Passwords don't match.");
    resetMessages();
    setSending(true);
    const { error: err } = await supabaseBrowser.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: redirectUrl(redirectPath) },
    });
    setSending(false);
    if (err) {
      // Supabase's current signUp behavior returns an explicit
      // "User already registered" error for this case (confirmed against
      // their own reference docs — older guides describing an obfuscated
      // non-error response are out of date). Surfacing this on SIGNUP
      // specifically is a deliberate, different choice from sign-in
      // above: telling someone "you already have an account" during
      // signup is a near-universal, low-stakes UX pattern, not the same
      // enumeration risk as revealing account existence during a failed
      // login attempt — which is why sign-in above stays deliberately
      // generic while this doesn't.
      if (/already registered|already exists/i.test(err.message || "")) {
        setError("An account with this email already exists — try signing in instead, or use \"Forgot password?\" if you don't remember it.");
        setAction("signin");
        return;
      }
      setError(err.message || "Couldn't create the account — try again.");
      return;
    }
    setSent("signup");
  }

  async function handleForgotPassword() {
    if (!EMAIL_RE.test(email)) return setError("Enter your email above first, then click \"Forgot password\".");
    resetMessages();
    setSending(true);
    const { error: err } = await supabaseBrowser.auth.resetPasswordForEmail(email, {
      redirectTo: redirectUrl("/reset-password"),
    });
    setSending(false);
    if (err) return setError(err.message || "Couldn't send the reset email — try again.");
    setSent("reset");
  }

  const sentMessage = {
    magiclink: `We sent a sign-in link to ${email}. Open it on this device to finish logging in.`,
    signup: `We sent a confirmation link to ${email}. Open it to activate your account, then come back and sign in.`,
    reset: `We sent a password reset link to ${email}. Open it to choose a new password.`,
  }[sent];

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
              <p className="mt-2 font-body text-sm text-charcoal/70">{sentMessage}</p>
              <button
                onClick={() => {
                  setSent(null);
                  setPassword("");
                  setConfirmPassword("");
                }}
                className="mt-6 font-body text-sm font-semibold text-coral_ember"
              >
                ← Back
              </button>
            </>
          ) : (
            <>
              <h1 className="font-display text-2xl">Log in</h1>

              {/* Method choice — password vs magic link, both always here */}
              <div className="mt-4 flex gap-2 rounded-cloth bg-indigo_night/5 p-1">
                <button
                  onClick={() => {
                    setMethod("password");
                    resetMessages();
                  }}
                  className={`flex-1 rounded-cloth py-2 font-body text-sm font-semibold ${
                    method === "password" ? "bg-white shadow-sm" : "text-charcoal/60"
                  }`}
                >
                  Password
                </button>
                <button
                  onClick={() => {
                    setMethod("magiclink");
                    resetMessages();
                  }}
                  className={`flex-1 rounded-cloth py-2 font-body text-sm font-semibold ${
                    method === "magiclink" ? "bg-white shadow-sm" : "text-charcoal/60"
                  }`}
                >
                  Email link
                </button>
              </div>

              {method === "magiclink" ? (
                <>
                  <p className="mt-4 font-body text-sm text-charcoal/70">
                    We'll email you a link — no password needed.
                  </p>
                  <form onSubmit={handleMagicLink}>
                    <label className="mt-4 block font-body font-semibold">Email</label>
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
              ) : (
                <>
                  <p className="mt-4 font-body text-sm text-charcoal/70">
                    {action === "signin" ? "Sign in with your email and password." : "Create an account with a password."}
                  </p>
                  <form onSubmit={action === "signin" ? handlePasswordSignIn : handlePasswordSignUp}>
                    <label className="mt-4 block font-body font-semibold">Email</label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      className="mt-1 w-full rounded-cloth border border-charcoal/15 bg-white px-4 py-2 font-body"
                    />
                    <label className="mt-4 block font-body font-semibold">Password</label>
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder={action === "signup" ? "At least 8 characters" : "••••••••"}
                      className="mt-1 w-full rounded-cloth border border-charcoal/15 bg-white px-4 py-2 font-body"
                    />
                    {action === "signup" && (
                      <>
                        <label className="mt-4 block font-body font-semibold">Confirm password</label>
                        <input
                          type="password"
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          placeholder="••••••••"
                          className="mt-1 w-full rounded-cloth border border-charcoal/15 bg-white px-4 py-2 font-body"
                        />
                      </>
                    )}
                    {action === "signin" && (
                      <button
                        type="button"
                        onClick={handleForgotPassword}
                        disabled={sending}
                        className="mt-2 font-body text-sm text-charcoal/60 underline disabled:opacity-50"
                      >
                        Forgot password?
                      </button>
                    )}
                    {error && <p className="mt-1 font-body text-sm text-coral_ember">{error}</p>}
                    <button
                      type="submit"
                      disabled={sending}
                      className="mt-6 w-full rounded-cloth bg-coral_ember px-6 py-3 font-body font-bold text-white disabled:opacity-50"
                    >
                      {sending ? "Please wait…" : action === "signin" ? "Sign in" : "Create account"}
                    </button>
                  </form>
                  <button
                    onClick={() => {
                      setAction(action === "signin" ? "signup" : "signin");
                      resetMessages();
                    }}
                    className="mt-4 w-full text-center font-body text-sm text-charcoal/60"
                  >
                    {action === "signin" ? "New here? Create an account" : "Already have an account? Sign in"}
                  </button>
                </>
              )}
            </>
          )}
        </div>
      </main>
    </>
  );
}

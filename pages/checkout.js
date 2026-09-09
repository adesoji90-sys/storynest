import { useEffect, useState } from "react";
import Head from "next/head";
import Link from "next/link";
import Script from "next/script";
import { useRouter } from "next/router";
import { getCharacterById } from "@/data/characters";
import { getPageTier, getPrice, SUBSCRIPTION_MAX_BOOKS_PER_MONTH } from "@/lib/pricing";
import { supabaseBrowser } from "@/lib/supabaseBrowserClient";

// Paystack Inline v2 — loaded directly rather than through react-paystack,
// which hasn't been updated in ~2 years and still only implements the old
// v1 popup API (PaystackPop.setup({callback, onClose}).openIframe()).
// Paystack's own v1 script is apparently no longer fully compatible with
// that old call shape (surfaces as "Attribute callback must be a valid
// function" from inline.js's own validation). v2's API — new
// PaystackPop().newTransaction({ onSuccess, onCancel, ... }) — is current
// and documented at paystack.com/docs/developer-tools/inlinejs.
const PAYSTACK_SCRIPT_SRC = "https://js.paystack.co/v2/inline.js";

export default function Checkout() {
  const router = useRouter();
  const [draft, setDraft] = useState(null);
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState("");
  const [processing, setProcessing] = useState(false);
  const [session, setSession] = useState(null);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [subscriptionPageTier, setSubscriptionPageTier] = useState(null);
  const [subscriptionBooksUsed, setSubscriptionBooksUsed] = useState(0);
  const [scriptReady, setScriptReady] = useState(false);

  useEffect(() => {
    const raw = sessionStorage.getItem("storynest_draft");
    if (!raw) {
      router.replace("/characters");
      return;
    }
    setDraft(JSON.parse(raw));
  }, [router]);

  useEffect(() => {
    async function checkSession() {
      const { data } = await supabaseBrowser.auth.getSession();
      if (!data.session) return;
      setSession(data.session);
      setEmail(data.session.user.email || "");
      const { data: profile } = await supabaseBrowser
        .from("profiles")
        .select("subscription_status, subscription_page_tier, subscription_books_used_this_period")
        .eq("id", data.session.user.id)
        .maybeSingle();
      setIsSubscribed(profile?.subscription_status === "active");
      setSubscriptionPageTier(profile?.subscription_page_tier || null);
      setSubscriptionBooksUsed(profile?.subscription_books_used_this_period || 0);
    }
    checkSession();
  }, []);

  const tier = draft?.tier === "premium" ? "premium" : "basic";
  const pageTierId = draft?.pageTier || "standard";
  const pageTier = getPageTier(pageTierId);
  const priceNaira = getPrice(tier, pageTierId);

  // Subscription covers Basic-tier stories only, matching the brief
  // ("Unlimited digital stories" was scoped to the Basic tier's reusable
  // character library — Premium's per-story image-generation cost doesn't
  // fit a flat subscription without a fair-use cap, which isn't built).
  //
  // Also now checks the page-tier match and remaining monthly allowance —
  // subscriptions are per page tier with a real cap (see lib/pricing.js),
  // not a flat "unlimited" plan anymore. Checking this here, not just
  // relying on the API to reject an invalid redemption, is what keeps the
  // button honest: without this, a subscriber whose plan doesn't cover
  // this page tier (or who's used all their books this period) would see
  // "Included in your plan" right up until the API rejected it.
  const subscriptionRemaining = SUBSCRIPTION_MAX_BOOKS_PER_MONTH - subscriptionBooksUsed;
  const subscriptionCovers =
    tier === "basic" && isSubscribed && subscriptionPageTier === pageTierId && subscriptionRemaining > 0;

  async function finalizeOrder(reference) {
    const res = await fetch("/api/verify-payment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reference,
        email,
        draft,
        tier,
        pageTier: pageTierId,
        userId: session?.user?.id || null,
      }),
    });
    if (!res.ok) throw new Error("verification failed");
    router.push("/success");
  }

  function handlePay() {
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      setEmailError("Enter a valid email so we can send the PDF.");
      return;
    }
    if (!scriptReady || typeof window === "undefined" || !window.PaystackPop) {
      setEmailError("Payment is still loading — wait a second and try again.");
      return;
    }
    setEmailError("");
    setProcessing(true);

    const reference = `storynest_${Date.now()}`;
    const popup = new window.PaystackPop();
    popup.newTransaction({
      key: process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY,
      email,
      amount: priceNaira * 100, // kobo
      currency: "NGN",
      ref: reference,
      onSuccess: async () => {
        try {
          await finalizeOrder(reference);
        } catch {
          setProcessing(false);
          alert(
            "We couldn't confirm the payment yet — check your email, or contact support with your reference: " +
              reference
          );
        }
      },
      onCancel: () => setProcessing(false),
    });
  }

  async function handleRedeemWithSubscription() {
    setProcessing(true);
    try {
      const res = await fetch("/api/redeem-subscription-story", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, draft, tier, pageTier: pageTierId, userId: session.user.id }),
      });
      if (!res.ok) throw new Error("Couldn't redeem this story on your subscription.");
      router.push("/success");
    } catch (err) {
      setProcessing(false);
      alert(err.message || "Something went wrong.");
    }
  }

  if (!draft) return null;
  const isPremium = tier === "premium";
  const character = isPremium ? null : getCharacterById(draft.characterId);

  return (
    <>
      <Head>
        <title>Checkout — StoryNest</title>
      </Head>
      <Script src={PAYSTACK_SCRIPT_SRC} strategy="afterInteractive" onReady={() => setScriptReady(true)} />
      <main className="min-h-screen bg-ivory_cloth text-charcoal">
        <header className="mx-auto flex max-w-2xl items-center justify-between px-6 py-6">
          <Link href="/" className="font-display text-xl">StoryNest</Link>
          <Link href="/preview" className="font-body text-sm text-charcoal/60">← Back to preview</Link>
        </header>

        <div className="mx-auto max-w-2xl px-6 pb-24">
          <h1 className="font-display text-3xl">Order summary</h1>

          <div className="mt-6 rounded-cloth bg-white p-6 shadow-sm">
            <div className="flex justify-between font-body">
              <span>{draft.title}</span>
              <span className="font-semibold">
                {subscriptionCovers ? "Included in your plan" : `₦${priceNaira.toLocaleString("en-NG")}`}
              </span>
            </div>
            <p className="mt-1 font-body text-sm text-charcoal/60">
              {isPremium
                ? `Starring ${draft.childName} · Premium · ${pageTier.label} · ${draft.pages.length} illustrated pages`
                : `Starring ${character?.name} · Basic · ${pageTier.label} · ${draft.pages.length} illustrated pages`}
            </p>
            {isPremium && (
              <ul className="mt-4 space-y-1 font-body text-sm text-charcoal/70">
                <li>✓ Custom illustrated character from your photo</li>
                <li>✓ {draft.pages.length} full-page illustrations</li>
                <li>✓ High-resolution PDF</li>
                <li className="text-charcoal/40">Printed copy available separately — see email after purchase</li>
              </ul>
            )}
          </div>

          {isSubscribed && !subscriptionCovers && tier === "basic" && (
            <p className="mt-3 font-body text-sm text-charcoal/60">
              {subscriptionPageTier !== pageTierId
                ? `Your subscription covers "${getPageTier(subscriptionPageTier)?.label || subscriptionPageTier}" books — this one's "${pageTier.label}", so it's billed separately.`
                : `You've used all ${SUBSCRIPTION_MAX_BOOKS_PER_MONTH} books included in this billing period — it resets when your subscription renews.`}
            </p>
          )}

          {subscriptionCovers ? (
            <>
              <p className="mt-8 font-body text-sm text-leaf">
                You're on the StoryNest subscription — this story is included at no extra charge.
              </p>
              <button
                onClick={handleRedeemWithSubscription}
                disabled={processing}
                className="mt-4 w-full rounded-cloth bg-coral_ember px-6 py-3 font-body font-bold text-white disabled:opacity-50"
              >
                {processing ? "Saving your story…" : "Get this story"}
              </button>
            </>
          ) : (
            <>
              <label className="mt-8 block font-body font-semibold">Email — for your order record</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="mt-1 w-full rounded-cloth border border-charcoal/15 bg-white px-4 py-2 font-body"
              />
              {emailError && <p className="mt-1 font-body text-sm text-coral_ember">{emailError}</p>}

              <button
                onClick={handlePay}
                disabled={processing}
                className="mt-8 w-full rounded-cloth bg-coral_ember px-6 py-3 font-body font-bold text-white disabled:opacity-50"
              >
                {processing ? "Opening secure payment…" : "Pay now"}
              </button>
              <p className="mt-3 text-center font-body text-xs text-charcoal/50">
                Payments are processed securely by Paystack (card, bank transfer, or USSD).
              </p>
              {tier === "basic" && !session && (
                <p className="mt-4 text-center font-body text-xs text-charcoal/50">
                  <Link href={`/login?redirect=/checkout`} className="underline">
                    Log in
                  </Link>{" "}
                  if you have a subscription — subscribers don't pay per story.
                </p>
              )}
            </>
          )}
        </div>
      </main>
    </>
  );
}

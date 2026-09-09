import { useEffect, useState } from "react";
import Head from "next/head";
import Link from "next/link";
import Script from "next/script";
import { useRouter } from "next/router";
import { supabaseBrowser } from "@/lib/supabaseBrowserClient";
import { PAGE_TIERS, SUBSCRIPTION_PRICING_NAIRA, SUBSCRIPTION_MAX_BOOKS_PER_MONTH } from "@/lib/pricing";

// See checkout.js for why this calls Paystack Inline v2 directly instead
// of through react-paystack (unmaintained, stuck on the old v1 popup API).
const PAYSTACK_SCRIPT_SRC = "https://js.paystack.co/v2/inline.js";

// One plan per page tier now, not a monthly/yearly billing-frequency
// choice — see lib/pricing.js for why (the old flat "unlimited" plan was
// a real, quantified financial risk once Basic tier started generating
// real illustrations). Monthly billing only for now; yearly billing was
// dropped as a deliberate scope simplification, not because it couldn't
// work the same way per tier.
const PLANS = PAGE_TIERS.map((t) => ({
  id: t.id,
  label: t.label,
  priceLabel: `₦${SUBSCRIPTION_PRICING_NAIRA[t.id].toLocaleString("en-NG")}/month`,
  planCode:
    t.id === "short"
      ? process.env.NEXT_PUBLIC_PAYSTACK_PLAN_SHORT
      : t.id === "standard"
      ? process.env.NEXT_PUBLIC_PAYSTACK_PLAN_STANDARD
      : process.env.NEXT_PUBLIC_PAYSTACK_PLAN_LONG,
}));

export default function Subscribe() {
  const router = useRouter();
  const [session, setSession] = useState(undefined);
  const [selected, setSelected] = useState("standard");
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState("");
  const [scriptReady, setScriptReady] = useState(false);

  useEffect(() => {
    async function checkSession() {
      const { data } = await supabaseBrowser.auth.getSession();
      if (!data.session) {
        router.replace("/login?redirect=/subscribe");
        return;
      }
      setSession(data.session);
    }
    checkSession();
  }, [router]);

  const plan = PLANS.find((p) => p.id === selected);

  function handleSubscribe() {
    if (!plan?.planCode) {
      setError(
        `This plan isn't configured yet — add NEXT_PUBLIC_PAYSTACK_PLAN_${selected.toUpperCase()} to your environment (see README).`
      );
      return;
    }
    if (!scriptReady || typeof window === "undefined" || !window.PaystackPop) {
      setError("Payment is still loading — wait a second and try again.");
      return;
    }
    setError("");
    setProcessing(true);

    const reference = `storynest_sub_${Date.now()}`;
    const popup = new window.PaystackPop();
    popup.newTransaction({
      key: process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY,
      email: session.user.email,
      amount: 0, // Paystack ignores `amount` when `plan` is set — the plan's own price is charged
      currency: "NGN",
      ref: reference,
      plan: plan.planCode,
      onSuccess: async () => {
        try {
          const res = await fetch("/api/verify-subscription", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ reference, userId: session.user.id, pageTier: selected }),
          });
          if (!res.ok) throw new Error("Couldn't confirm the subscription.");
          router.push("/account");
        } catch (err) {
          setProcessing(false);
          setError(err.message || "Something went wrong confirming your subscription.");
        }
      },
      onCancel: () => setProcessing(false),
    });
  }

  if (session === undefined) return null;

  return (
    <>
      <Head>
        <title>Subscribe — StoryNest</title>
      </Head>
      <Script src={PAYSTACK_SCRIPT_SRC} strategy="afterInteractive" onReady={() => setScriptReady(true)} />
      <main className="min-h-screen bg-ivory_cloth text-charcoal">
        <header className="mx-auto flex max-w-2xl items-center justify-between px-6 py-6">
          <Link href="/" className="font-display text-xl">StoryNest</Link>
          <Link href="/account" className="font-body text-sm text-charcoal/60">← My Library</Link>
        </header>

        <div className="mx-auto max-w-2xl px-6 pb-24">
          <h1 className="font-display text-3xl">Basic-tier subscriptions</h1>
          <p className="mt-2 font-body text-charcoal/70">
            Up to {SUBSCRIPTION_MAX_BOOKS_PER_MONTH} Basic-tier books a month from the 30-character library, at one
            page length of your choice — pick the length you use most. Premium stories with a custom photo
            character are always billed separately.
          </p>

          <div className="mt-8 grid grid-cols-3 gap-3">
            {PLANS.map((p) => (
              <button
                key={p.id}
                onClick={() => setSelected(p.id)}
                className={`rounded-cloth border-2 p-5 text-left font-body ${
                  selected === p.id ? "border-coral_ember bg-coral_ember/5" : "border-charcoal/15 bg-white"
                }`}
              >
                <p className="font-bold">{p.label}</p>
                <p className="mt-1 text-charcoal/60">{p.priceLabel}</p>
                <p className="mt-1 text-xs text-charcoal/40">Up to {SUBSCRIPTION_MAX_BOOKS_PER_MONTH}/month</p>
              </button>
            ))}
          </div>

          {error && <p className="mt-4 font-body text-sm text-coral_ember">{error}</p>}

          <button
            onClick={handleSubscribe}
            disabled={processing}
            className="mt-8 w-full rounded-cloth bg-coral_ember px-6 py-3 font-body font-bold text-white disabled:opacity-50"
          >
            {processing ? "Opening secure payment…" : `Subscribe — ${plan?.priceLabel}`}
          </button>
          <p className="mt-3 text-center font-body text-xs text-charcoal/50">
            Recurring billing via Paystack. Cancel anytime from your Paystack receipt email or by contacting support.
            Your book plan is fixed to the page length you subscribe at — a book at a different length is billed
            individually at the regular price.
          </p>
        </div>
      </main>
    </>
  );
}

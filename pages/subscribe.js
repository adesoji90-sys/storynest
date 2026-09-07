import { useEffect, useState } from "react";
import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { usePaystackPayment } from "react-paystack";
import { supabaseBrowser } from "@/lib/supabaseBrowserClient";

const PLANS = [
  {
    id: "monthly",
    label: "Monthly",
    priceLabel: "₦8,000/month",
    planCode: process.env.NEXT_PUBLIC_PAYSTACK_PLAN_MONTHLY,
  },
  {
    id: "yearly",
    label: "Yearly",
    priceLabel: "₦50,000/year",
    planCode: process.env.NEXT_PUBLIC_PAYSTACK_PLAN_YEARLY,
  },
];

export default function Subscribe() {
  const router = useRouter();
  const [session, setSession] = useState(undefined);
  const [selected, setSelected] = useState("monthly");
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState("");

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

  const config = {
    reference: `storynest_sub_${Date.now()}`,
    email: session?.user?.email || "",
    amount: 0, // Paystack ignores `amount` when `plan` is set — the plan's own price is charged
    plan: plan?.planCode,
    publicKey: process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY,
    currency: "NGN",
  };

  const initializePayment = usePaystackPayment(config);

  function handleSubscribe() {
    if (!plan?.planCode) {
      setError(
        "This plan isn't configured yet — add NEXT_PUBLIC_PAYSTACK_PLAN_MONTHLY / _YEARLY to your environment (see README)."
      );
      return;
    }
    setError("");
    setProcessing(true);
    initializePayment({
      onSuccess: async (reference) => {
        try {
          const res = await fetch("/api/verify-subscription", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ reference: reference.reference, userId: session.user.id, plan: selected }),
          });
          if (!res.ok) throw new Error("Couldn't confirm the subscription.");
          router.push("/account");
        } catch (err) {
          setProcessing(false);
          setError(err.message || "Something went wrong confirming your subscription.");
        }
      },
      onClose: () => setProcessing(false),
    });
  }

  if (session === undefined) return null;

  return (
    <>
      <Head>
        <title>Subscribe — StoryNest</title>
      </Head>
      <main className="min-h-screen bg-ivory_cloth text-charcoal">
        <header className="mx-auto flex max-w-2xl items-center justify-between px-6 py-6">
          <Link href="/" className="font-display text-xl">StoryNest</Link>
          <Link href="/account" className="font-body text-sm text-charcoal/60">← My Library</Link>
        </header>

        <div className="mx-auto max-w-2xl px-6 pb-24">
          <h1 className="font-display text-3xl">Unlimited Basic-tier stories</h1>
          <p className="mt-2 font-body text-charcoal/70">
            One subscription, unlimited Basic-tier stories from the 30-character library. Premium stories with a
            custom photo character are billed separately.
          </p>

          <div className="mt-8 grid grid-cols-2 gap-4">
            {PLANS.map((p) => (
              <button
                key={p.id}
                onClick={() => setSelected(p.id)}
                className={`rounded-cloth border-2 p-6 text-left font-body ${
                  selected === p.id ? "border-coral_ember bg-coral_ember/5" : "border-charcoal/15 bg-white"
                }`}
              >
                <p className="font-bold">{p.label}</p>
                <p className="mt-1 text-charcoal/60">{p.priceLabel}</p>
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
          </p>
        </div>
      </main>
    </>
  );
}

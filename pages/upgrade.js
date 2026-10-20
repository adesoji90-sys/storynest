import { useEffect, useState } from "react";
import Head from "next/head";
import Link from "next/link";
import AppHeader from "@/components/AppHeader";
import { Card, Button } from "@/components/ui";
import { supabaseBrowser } from "@/lib/supabaseBrowserClient";
import { isAndroidApp, loadPrices, buyPlan, restorePlan, manageSubscriptionUrl } from "@/lib/nativeBilling";

// Plans: Free (1 library book a month), Standard (whole library), Family
// (Standard + custom books + up to 5 children).
//
// In the Android app the paid plans are bought through Google Play (Google's
// rules require this for subscriptions bought inside an Android app). The
// server then checks the purchase with Google and switches the plan on, so the
// plan also works on the website. On the website this page explains the plans
// and where to get them. It does not take payment here.

// Set NEXT_PUBLIC_ANDROID_APP_LIVE=true in Vercel once the app is published on Google Play.
// (These two values are public links, not secrets.)
const APP_LIVE = process.env.NEXT_PUBLIC_ANDROID_APP_LIVE === "true";
const PLAY_URL = "https://play.google.com/store/apps/details?id=com.booostglobal.evoke";

const PLAN_INFO = {
  standard: {
    name: "Standard",
    fallbackPrice: "₦3,000",
    features: [
      "The whole library, with new books added regularly",
      "One child profile with reading progress",
      "Read and listen to every library book",
      "Order printed softback or hardback copies",
    ],
  },
  family: {
    name: "Family",
    fallbackPrice: "₦10,000",
    features: [
      "Everything in Standard",
      "Create custom AI-generated books and characters",
      "Up to 5 children, each with their own profile",
      "Order printed softback or hardback copies",
    ],
  },
};

function formatDate(value) {
  if (!value) return "";
  try {
    return new Date(value).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });
  } catch {
    return "";
  }
}

function Features({ items }) {
  return (
    <ul className="mt-3 space-y-2 text-left font-body text-sm text-charcoal/70">
      {items.map((f) => (
        <li key={f}>• {f}</li>
      ))}
    </ul>
  );
}

export default function Upgrade() {
  const [android, setAndroid] = useState(false);
  const [session, setSession] = useState(null);
  const [status, setStatus] = useState(null);
  const [prices, setPrices] = useState({});
  const [billingOk, setBillingOk] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function refreshStatus(accessToken) {
    const res = await fetch("/api/billing/status", { headers: { Authorization: `Bearer ${accessToken}` } });
    if (res.ok) setStatus(await res.json());
  }

  useEffect(() => {
    setAndroid(isAndroidApp());
    supabaseBrowser.auth.getSession().then(({ data }) => {
      const s = data && data.session;
      setSession(s || null);
      if (s) refreshStatus(s.access_token);
    });
  }, []);

  useEffect(() => {
    if (!android) return;
    loadPrices()
      .then((p) => {
        setBillingOk(p.supported);
        setPrices(p.prices || {});
      })
      .catch(() => setBillingOk(false));
  }, [android]);

  async function subscribe(code) {
    if (!session || !status) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await buyPlan({ code, familyId: status.familyId, accessToken: session.access_token });
      if (result.cancelled) {
        setMessage("No problem. You have not been charged.");
      } else if (result.pending) {
        setMessage("Your payment is still being processed. Your plan will switch on automatically when it completes.");
      } else {
        setMessage(`Thank you! The ${PLAN_INFO[code].name} plan is now active.`);
      }
      await refreshStatus(session.access_token);
    } catch (e) {
      setError(e.message || "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function restore() {
    if (!session || !status) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await restorePlan({ familyId: status.familyId, accessToken: session.access_token });
      setMessage(result.restored ? "Your plan has been restored." : "We did not find an active plan on this Google account.");
      await refreshStatus(session.access_token);
    } catch (e) {
      setError(e.message || "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  const current = status ? status.planCode : "reader";
  const paid = current === "standard" || current === "family";

  function PlanCard({ code }) {
    const info = PLAN_INFO[code];
    const isCurrent = current === code;
    const price = prices[code] || null;
    return (
      <Card>
        <h2 className="font-display text-xl">{info.name}</h2>
        <p className="mt-1 font-body text-sm text-charcoal/60">
          {price ? `${price} / month` : `${info.fallbackPrice} / month`}
        </p>
        <Features items={info.features} />

        {session && isCurrent && (
          <div className="mt-4 rounded-cloth bg-ivory_cloth p-3 font-body text-sm text-charcoal/80">
            <p className="font-semibold">This is your plan.</p>
            {status.renewsOrEndsAt && (
              <p className="mt-1">
                {status.willRenew ? "Renews on " : "Ends on "}
                {formatDate(status.renewsOrEndsAt)}.
              </p>
            )}
            {android && status.provider === "google_play" && (
              <p className="mt-2">
                <a href={manageSubscriptionUrl(code)} target="_blank" rel="noreferrer" className="font-semibold text-coral_ember">
                  Manage subscription in Google Play
                </a>
              </p>
            )}
          </div>
        )}

        {session && !isCurrent && android && billingOk && !(current === "family" && code === "standard") && (
          <div className="mt-4">
            <Button onClick={() => subscribe(code)} disabled={busy || !status} className="w-full">
              {busy ? "Please wait…" : current === "standard" && code === "family" ? "Upgrade to Family" : `Subscribe to ${info.name}`}
            </Button>
          </div>
        )}
      </Card>
    );
  }

  return (
    <>
      <Head>
        <title>Plans — Evoke</title>
      </Head>
      <main className="min-h-screen bg-ivory_cloth text-charcoal">
        <AppHeader />
        <div className="mx-auto max-w-md space-y-4 px-6 py-12 text-center">
          <h1 className="font-display text-2xl">Choose a plan</h1>
          <p className="font-body text-sm text-charcoal/60">
            Free: read 1 library book each month. Upgrade any time for the whole library, or for custom books and more children.
          </p>

          {!session && (
            <p className="font-body text-sm text-charcoal/60">
              <Link href="/login" className="font-semibold text-coral_ember">
                Sign in
              </Link>{" "}
              to see your plan.
            </p>
          )}

          <PlanCard code="standard" />
          <PlanCard code="family" />

          {session && android && billingOk && (
            <div>
              <p className="font-body text-xs text-charcoal/50">
                Billed monthly through Google Play. Cancel any time in Google Play. Only a parent or guardian should make this purchase.
                {current === "standard" && " If you upgrade to Family, your Standard plan stops renewing automatically."}
              </p>
              <button onClick={restore} disabled={busy} className="mt-3 font-body text-sm font-semibold text-coral_ember">
                Restore my purchase
              </button>
            </div>
          )}
          {session && android && !billingOk && (
            <p className="font-body text-sm text-charcoal/60">Purchases are not available on this device right now.</p>
          )}
          {!android && !paid && (
            <div className="rounded-cloth bg-white p-4 font-body text-sm text-charcoal/70">
              {APP_LIVE ? (
                <>
                  <p>Plans are bought in the Evoke Android app. Once you subscribe there, your plan works here on the website too.</p>
                  <a
                    href={PLAY_URL}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-3 inline-block rounded-full bg-coral_ember px-5 py-2 font-semibold text-white"
                  >
                    Get the Evoke Android app
                  </a>
                </>
              ) : (
                <p>
                  Plans will be bought in the Evoke Android app, which is coming soon to Google Play. Once you subscribe there, your plan
                  works here on the website too.
                </p>
              )}
            </div>
          )}

          {message && <p className="font-body text-sm text-leaf">{message}</p>}
          {error && <p className="font-body text-sm text-red-700">{error}</p>}

          <Link href="/family" className="inline-block font-body text-sm font-semibold text-coral_ember">
            ← Back to your family
          </Link>
        </div>
      </main>
    </>
  );
}

// POST /api/verify-subscription
// Called right after Paystack's inline popup reports success for a plan-based
// charge (see pages/subscribe.js). Verifies server-side, then activates the
// subscription on the parent's profile. Renewals after this first charge are
// handled by Paystack automatically and reconciled via
// /api/paystack-webhook's `subscription.*` / `charge.success` handling —
// this route only ever runs once, at signup.
//
// Subscriptions are per PAGE TIER now (short/standard/long — see
// lib/pricing.js), not a monthly/yearly billing-frequency choice like the
// original flat "unlimited" plan had. Monthly billing only for now —
// yearly billing was a real feature of the old flat plan, dropped here as
// a deliberate scope simplification rather than building 6 total plans
// (3 page tiers × 2 billing frequencies) for a feature that hadn't been
// validated with real subscribers yet. Add it back the same way if
// there's real demand — one more Paystack plan code per page tier.
//
// Deliberately supports only ONE active subscription per account, matching
// the simplicity of the original flat-plan design — a parent can't be
// subscribed to two page tiers at once. The UI (subscribe.js) doesn't
// currently prevent re-subscribing to a different tier while one is
// active; if that happens, this just overwrites the previous tier, which
// is an acceptable simplification for now, not a deliberately designed
// upgrade/downgrade flow.

import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function nextRenewalDate() {
  const d = new Date();
  d.setMonth(d.getMonth() + 1);
  return d.toISOString();
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { reference, userId, pageTier } = req.body || {};
  if (!reference || !userId || !pageTier) {
    return res.status(400).json({ error: "Missing reference, userId, or pageTier." });
  }
  if (!["short", "standard", "long"].includes(pageTier)) {
    return res.status(400).json({ error: "pageTier must be short, standard, or long." });
  }

  try {
    const verifyRes = await fetch(
      `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
      { headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` } }
    );
    const verifyData = await verifyRes.json();

    if (!verifyRes.ok || verifyData?.data?.status !== "success") {
      return res.status(402).json({ error: "Subscription payment not confirmed by Paystack." });
    }

    const { error } = await supabaseAdmin
      .from("profiles")
      .update({
        subscription_status: "active",
        subscription_page_tier: pageTier,
        subscription_books_used_this_period: 0,
        subscription_renews_at: nextRenewalDate(),
        paystack_customer_code: verifyData.data?.customer?.customer_code || null,
      })
      .eq("id", userId);

    if (error) {
      console.error("Supabase profile update error:", error);
      return res.status(502).json({ error: "Payment succeeded but we couldn't activate the subscription — contact support." });
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Unexpected server error." });
  }
}

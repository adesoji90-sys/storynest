// POST /api/verify-subscription
// Called right after Paystack's inline popup reports success for a plan-based
// charge (see pages/subscribe.js). Verifies server-side, then activates the
// subscription on the parent's profile. Renewals after this first charge are
// handled by Paystack automatically and reconciled via
// /api/paystack-webhook's `subscription.*` / `charge.success` handling —
// this route only ever runs once, at signup.

import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function nextRenewalDate(plan) {
  const d = new Date();
  if (plan === "yearly") d.setFullYear(d.getFullYear() + 1);
  else d.setMonth(d.getMonth() + 1);
  return d.toISOString();
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { reference, userId, plan } = req.body || {};
  if (!reference || !userId || !plan) {
    return res.status(400).json({ error: "Missing reference, userId, or plan." });
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
        subscription_plan: plan,
        subscription_renews_at: nextRenewalDate(plan),
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

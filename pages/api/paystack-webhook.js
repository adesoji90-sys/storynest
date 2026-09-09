// POST /api/paystack-webhook
// Configure this URL in your Paystack dashboard under Settings → API Keys & Webhooks:
//   https://yourdomain.com/api/paystack-webhook
// This is the authoritative confirmation — always verify the signature and
// never trust a webhook body without it.

import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

export const config = {
  api: {
    bodyParser: false, // we need the raw body to verify the HMAC signature
  },
};

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const rawBody = await readRawBody(req);

  const hash = crypto
    .createHmac("sha512", process.env.PAYSTACK_SECRET_KEY)
    .update(rawBody)
    .digest("hex");

  if (hash !== req.headers["x-paystack-signature"]) {
    return res.status(401).json({ error: "Invalid signature" });
  }

  const event = JSON.parse(rawBody);

  if (event.event === "charge.success") {
    const { reference, status, amount, customer } = event.data;

    // A recurring subscription charge (renewal) also fires charge.success,
    // identifiable by having a `plan` on the charge. One-off orders don't.
    if (event.data.plan) {
      if (customer?.customer_code) {
        await supabaseAdmin
          .from("profiles")
          .update({
            subscription_status: "active",
            // Reset on every successful renewal charge — a new billing
            // period has been paid for, so the book count starts over.
            // Without this, a subscriber's usage would just accumulate
            // forever and permanently lock them out after their first
            // period's worth of books.
            subscription_books_used_this_period: 0,
          })
          .eq("paystack_customer_code", customer.customer_code);
      }
      return res.status(200).json({ received: true });
    }

    const { error } = await supabaseAdmin
      .from("orders")
      .update({ status: "paid", amount_kobo: amount })
      .eq("reference", reference);

    if (error) {
      // If the order row doesn't exist yet (webhook arrived before
      // verify-payment ran), upsert a minimal record instead.
      await supabaseAdmin.from("orders").upsert({
        reference,
        email: customer?.email,
        status,
        amount_kobo: amount,
      });
    }
  }

  // Subscription lifecycle events — keep profiles.subscription_status in
  // sync with what Paystack actually thinks is happening, since renewals
  // and cancellations happen entirely on Paystack's side after the initial
  // signup in /api/verify-subscription.
  if (event.event === "subscription.disable" || event.event === "subscription.not_renew") {
    const customerCode = event.data?.customer?.customer_code;
    if (customerCode) {
      await supabaseAdmin
        .from("profiles")
        .update({ subscription_status: "cancelled" })
        .eq("paystack_customer_code", customerCode);
    }
  }

  if (event.event === "invoice.payment_failed") {
    const customerCode = event.data?.customer?.customer_code;
    if (customerCode) {
      await supabaseAdmin
        .from("profiles")
        .update({ subscription_status: "past_due" })
        .eq("paystack_customer_code", customerCode);
    }
  }

  return res.status(200).json({ received: true });
}

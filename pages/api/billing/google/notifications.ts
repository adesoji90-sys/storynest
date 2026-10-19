// POST /api/billing/google/notifications?secret=...
//
// Google Play "real-time developer notifications" arrive here through a Cloud
// Pub/Sub push subscription. They tell us about renewals, cancellations,
// refunds and failed payments that happen when the app is closed, so a
// family's plan always matches what Google says.
//
// Protected by a shared secret in the URL (GOOGLE_PLAY_RTDN_SECRET). Always
// answers 200 for notifications we can ignore, and 500 for temporary failures
// so Pub/Sub retries.
import type { NextApiRequest, NextApiResponse } from "next";
import { timingSafeEqual } from "crypto";
import { BillingError, PACKAGE_NAME } from "@/lib/billing/googlePlay";
import { syncGooglePlayPurchase } from "@/lib/billing/entitlements";

function secretMatches(provided: string | undefined): boolean {
  const expected = process.env.GOOGLE_PLAY_RTDN_SECRET;
  if (!expected || !provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

type Notification = {
  packageName?: string;
  testNotification?: unknown;
  subscriptionNotification?: { purchaseToken?: string; subscriptionId?: string; notificationType?: number };
  voidedPurchaseNotification?: { purchaseToken?: string; productType?: number };
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).end();

  const secret = Array.isArray(req.query.secret) ? req.query.secret[0] : req.query.secret;
  if (!secretMatches(secret)) return res.status(401).end();

  let notification: Notification;
  try {
    const data = req.body?.message?.data;
    if (!data) return res.status(200).end();
    notification = JSON.parse(Buffer.from(data, "base64").toString("utf8"));
  } catch {
    return res.status(200).end(); // malformed: retrying will not help
  }

  if (notification.packageName && notification.packageName !== PACKAGE_NAME) return res.status(200).end();
  if (notification.testNotification) return res.status(200).end();

  const token =
    notification.subscriptionNotification?.purchaseToken ||
    (notification.voidedPurchaseNotification?.productType === 1
      ? notification.voidedPurchaseNotification.purchaseToken
      : undefined);
  if (!token) return res.status(200).end();

  try {
    await syncGooglePlayPurchase(token);
    return res.status(200).end();
  } catch (err) {
    if (err instanceof BillingError && err.status < 500) {
      console.error("RTDN ignored:", err.message);
      return res.status(200).end();
    }
    console.error("RTDN failed, Pub/Sub will retry", err);
    return res.status(500).end();
  }
}

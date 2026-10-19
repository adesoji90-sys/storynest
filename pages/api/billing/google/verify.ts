// POST /api/billing/google/verify
// Body: { purchaseToken: string, productId: string }
//
// Called by the Android app right after a parent buys (or restores) the Family
// plan. The server asks Google whether the purchase is real, and only then
// switches the family's plan on.
import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import { requireFamily } from "@/lib/authFamily";
import { BillingError, planCodeForProduct } from "@/lib/billing/googlePlay";
import { syncGooglePlayPurchase } from "@/lib/billing/entitlements";

const Body = z.object({
  purchaseToken: z.string().min(10).max(2000),
  productId: z.string().min(1).max(200),
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const auth = await requireFamily(req);
  if (!auth.ok) return res.status(auth.status).json({ error: auth.error });

  const parsed = Body.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid request." });
  if (!planCodeForProduct(parsed.data.productId)) {
    return res.status(400).json({ error: "Unknown product." });
  }

  try {
    const result = await syncGooglePlayPurchase(parsed.data.purchaseToken, auth.familyId);
    if (!result) return res.status(400).json({ error: "Could not match this purchase to your account." });
    return res.status(200).json({
      ok: true,
      entitled: result.entitled,
      pending: result.pending,
      status: result.status,
      expiresAt: result.expiresAt,
      autoRenew: result.autoRenew,
    });
  } catch (err) {
    if (err instanceof BillingError) return res.status(err.status).json({ error: err.message });
    console.error("verify purchase failed", err);
    return res.status(500).json({ error: "Something went wrong. Please try again." });
  }
}

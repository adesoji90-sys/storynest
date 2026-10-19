// Google Play Billing from inside the Android app (Capacitor).
// Everything here only does anything in the Android app; on the website
// isAndroidApp() is false and these functions are never called.
//
// IDs must match what is created in Play Console (see docs/ANDROID_BILLING.md):
//   Standard: product evoke_standard, base plan monthly
//   Family:   product evoke_family,   base plan monthly

export const PLAY_PACKAGE = "com.booostglobal.evoke";

// code -> Play Console IDs. Both plans use a base plan called "monthly".
export const PLANS = {
  standard: { productId: "evoke_standard", basePlanId: "monthly" },
  family: { productId: "evoke_family", basePlanId: "monthly" },
};

export function isAndroidApp() {
  try {
    const cap = typeof window !== "undefined" ? window.Capacitor : null;
    return !!cap && typeof cap.isNativePlatform === "function" && cap.isNativePlatform() && cap.getPlatform() === "android";
  } catch {
    return false;
  }
}

async function plugin() {
  const mod = await import("@capgo/native-purchases");
  return { NativePurchases: mod.NativePurchases, PURCHASE_TYPE: mod.PURCHASE_TYPE };
}

// Prices as Google shows them for this user (local currency, including any
// introductory offer): { supported, prices: { standard: "₦3,000.00", family: "₦10,000.00" } }
export async function loadPrices() {
  const { NativePurchases, PURCHASE_TYPE } = await plugin();
  const support = await NativePurchases.isBillingSupported();
  if (!support.isBillingSupported) return { supported: false, prices: {} };
  const prices = {};
  for (const code of Object.keys(PLANS)) {
    try {
      const { products } = await NativePurchases.getProducts({
        productIdentifiers: [PLANS[code].productId],
        productType: PURCHASE_TYPE.SUBS,
      });
      const match = products.find((p) => p.identifier === PLANS[code].basePlanId) || products[0];
      prices[code] = match ? match.priceString : null;
    } catch {
      prices[code] = null;
    }
  }
  return { supported: true, prices };
}

async function verifyWithServer(purchaseToken, productId, accessToken) {
  const res = await fetch("/api/billing/google/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ purchaseToken, productId }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "We could not confirm your purchase. Please try again.");
  return data;
}

// Opens Google Play's purchase sheet, then asks our server to confirm it.
// familyId is attached to the purchase so a purchase can't be claimed by another family.
export async function buyPlan({ code, familyId, accessToken }) {
  const plan = PLANS[code];
  if (!plan) throw new Error("Unknown plan.");
  const { NativePurchases, PURCHASE_TYPE } = await plugin();
  let tx;
  try {
    tx = await NativePurchases.purchaseProduct({
      productIdentifier: plan.productId,
      planIdentifier: plan.basePlanId,
      productType: PURCHASE_TYPE.SUBS,
      appAccountToken: familyId,
      // The server acknowledges the purchase after it has switched the plan on.
      autoAcknowledgePurchases: false,
    });
  } catch (err) {
    const msg = String((err && err.message) || err || "");
    if (/cancel/i.test(msg)) return { cancelled: true };
    throw new Error("The purchase could not be completed. You have not been charged.");
  }
  if (!tx || !tx.purchaseToken) throw new Error("The purchase could not be completed.");
  const result = await verifyWithServer(tx.purchaseToken, plan.productId, accessToken);
  return { cancelled: false, ...result };
}

// For a new phone, a reinstall, or a purchase that finished while the app was closed.
export async function restorePlan({ familyId, accessToken }) {
  const { NativePurchases, PURCHASE_TYPE } = await plugin();
  const { purchases } = await NativePurchases.getPurchases({
    productType: PURCHASE_TYPE.SUBS,
    appAccountToken: familyId,
  });
  const ids = Object.values(PLANS).map((p) => p.productId);
  const candidates = (purchases || []).filter(
    (p) => ids.includes(p.productIdentifier) && p.purchaseToken && String(p.purchaseState) === "1"
  );
  for (const p of candidates) {
    const result = await verifyWithServer(p.purchaseToken, p.productIdentifier, accessToken);
    if (result.entitled) return { restored: true, ...result };
  }
  return { restored: false };
}

export function manageSubscriptionUrl(code) {
  const plan = PLANS[code] || PLANS.family;
  return `https://play.google.com/store/account/subscriptions?sku=${plan.productId}&package=${PLAY_PACKAGE}`;
}

// Talks to the Google Play Developer API to check a subscription purchase.
//
// Why the server checks every purchase: the Android app only tells us "this
// token was bought". Anyone could send a made-up token, so nothing is granted
// until Google confirms it (and says which account bought it).
//
// Configuration (all server-side env vars, never NEXT_PUBLIC_):
//   GOOGLE_PLAY_SERVICE_ACCOUNT_JSON  full JSON key of the service account (as one line)
//   GOOGLE_PLAY_PACKAGE_NAME          defaults to com.booostglobal.evoke
//   GOOGLE_PLAY_STANDARD_SUBSCRIPTION_ID  Standard product ID in Play Console (default evoke_standard)
//   GOOGLE_PLAY_FAMILY_SUBSCRIPTION_ID    Family product ID in Play Console (default evoke_family)
import { GoogleAuth } from "google-auth-library";

export class BillingError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export const PACKAGE_NAME = process.env.GOOGLE_PLAY_PACKAGE_NAME || "com.booostglobal.evoke";
export const STANDARD_PRODUCT_ID = process.env.GOOGLE_PLAY_STANDARD_SUBSCRIPTION_ID || "evoke_standard";
export const FAMILY_PRODUCT_ID = process.env.GOOGLE_PLAY_FAMILY_SUBSCRIPTION_ID || "evoke_family";

export type PaidPlanCode = "standard" | "family";

// Which Evoke plan a Google Play product unlocks. Anything else is rejected.
export function planCodeForProduct(productId: string | null | undefined): PaidPlanCode | null {
  if (productId === STANDARD_PRODUCT_ID) return "standard";
  if (productId === FAMILY_PRODUCT_ID) return "family";
  return null;
}

const API = "https://androidpublisher.googleapis.com/androidpublisher/v3/applications";

// The parts of Google's subscriptionsv2 response that we use.
export type GoogleSubscriptionResponse = {
  subscriptionState?: string;
  startTime?: string;
  latestOrderId?: string;
  linkedPurchaseToken?: string;
  acknowledgementState?: string;
  testPurchase?: Record<string, unknown>;
  externalAccountIdentifiers?: { obfuscatedExternalAccountId?: string };
  lineItems?: Array<{
    productId?: string;
    expiryTime?: string;
    autoRenewingPlan?: { autoRenewEnabled?: boolean };
  }>;
};

export type SubscriptionStatusName = "NONE" | "ACTIVE" | "PAST_DUE" | "CANCELLED" | "EXPIRED";

export type InterpretedSubscription = {
  productId: string | null;
  entitled: boolean; // should the family have the paid plan right now?
  status: SubscriptionStatusName;
  startTime: Date | null;
  expiryTime: Date | null;
  autoRenew: boolean;
  acknowledged: boolean;
  pending: boolean; // payment not finished yet
  isTest: boolean;
  accountId: string | null; // the obfuscated account id we set at purchase time (the family id)
  linkedPurchaseToken: string | null;
};

// Pure function (no network), so it can be tested on its own.
export function interpretSubscription(res: GoogleSubscriptionResponse, now: Date = new Date()): InterpretedSubscription {
  const line = res.lineItems?.[0];
  const expiryTime = line?.expiryTime ? new Date(line.expiryTime) : null;
  const futureExpiry = !!expiryTime && expiryTime.getTime() > now.getTime();
  const state = res.subscriptionState || "";

  let entitled = false;
  let status: SubscriptionStatusName = "NONE";
  switch (state) {
    case "SUBSCRIPTION_STATE_ACTIVE":
      entitled = futureExpiry || !expiryTime;
      status = "ACTIVE";
      break;
    case "SUBSCRIPTION_STATE_IN_GRACE_PERIOD":
      // Payment failed but Google is still retrying: keep access.
      entitled = true;
      status = "PAST_DUE";
      break;
    case "SUBSCRIPTION_STATE_CANCELED":
      // The user turned off renewal; access continues until the paid period ends.
      entitled = futureExpiry;
      status = futureExpiry ? "CANCELLED" : "EXPIRED";
      break;
    case "SUBSCRIPTION_STATE_ON_HOLD":
    case "SUBSCRIPTION_STATE_PAUSED":
      entitled = false;
      status = "PAST_DUE";
      break;
    case "SUBSCRIPTION_STATE_EXPIRED":
      entitled = false;
      status = "EXPIRED";
      break;
    case "SUBSCRIPTION_STATE_PENDING":
    case "SUBSCRIPTION_STATE_PENDING_PURCHASE_CANCELED":
    default:
      entitled = false;
      status = "NONE";
  }

  return {
    productId: line?.productId ?? null,
    entitled,
    status,
    startTime: res.startTime ? new Date(res.startTime) : null,
    expiryTime,
    autoRenew: !!line?.autoRenewingPlan?.autoRenewEnabled,
    acknowledged: res.acknowledgementState === "ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED",
    pending: state === "SUBSCRIPTION_STATE_PENDING",
    isTest: !!res.testPurchase,
    accountId: res.externalAccountIdentifiers?.obfuscatedExternalAccountId ?? null,
    linkedPurchaseToken: res.linkedPurchaseToken ?? null,
  };
}

let auth: GoogleAuth | null = null;
function getAuth(): GoogleAuth {
  if (auth) return auth;
  const raw = process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new BillingError(503, "Billing is not configured yet.");
  let credentials: Record<string, unknown>;
  try {
    credentials = JSON.parse(raw);
  } catch {
    throw new BillingError(503, "Billing is not configured correctly.");
  }
  auth = new GoogleAuth({ credentials, scopes: ["https://www.googleapis.com/auth/androidpublisher"] });
  return auth;
}

async function authHeader(): Promise<Record<string, string>> {
  const token = await getAuth().getAccessToken();
  if (!token) throw new BillingError(503, "Could not authenticate with Google Play.");
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

export async function fetchSubscription(purchaseToken: string): Promise<GoogleSubscriptionResponse> {
  const url = `${API}/${encodeURIComponent(PACKAGE_NAME)}/purchases/subscriptionsv2/tokens/${encodeURIComponent(purchaseToken)}`;
  const resp = await fetch(url, { headers: await authHeader() });
  if (resp.status === 404 || resp.status === 410 || resp.status === 400) {
    throw new BillingError(400, "Google Play does not recognise this purchase.");
  }
  if (!resp.ok) {
    console.error("Google Play API error", resp.status, await resp.text().catch(() => ""));
    throw new BillingError(502, "Could not check the purchase with Google Play. Please try again.");
  }
  return (await resp.json()) as GoogleSubscriptionResponse;
}

// Google refunds automatically if a purchase is not acknowledged within 3 days.
export async function acknowledgeSubscription(productId: string, purchaseToken: string): Promise<void> {
  const url = `${API}/${encodeURIComponent(PACKAGE_NAME)}/purchases/subscriptions/${encodeURIComponent(
    productId
  )}/tokens/${encodeURIComponent(purchaseToken)}:acknowledge`;
  const resp = await fetch(url, { method: "POST", headers: await authHeader(), body: "{}" });
  if (!resp.ok) {
    console.error("Google Play acknowledge error", resp.status, await resp.text().catch(() => ""));
    throw new BillingError(502, "Could not confirm the purchase with Google Play.");
  }
}

// Stops a subscription from renewing (the paid period stays usable until it ends).
// Used when a family moves from Standard to Family so they are not billed for both.
export async function stopRenewal(productId: string, purchaseToken: string): Promise<void> {
  const url = `${API}/${encodeURIComponent(PACKAGE_NAME)}/purchases/subscriptions/${encodeURIComponent(
    productId
  )}/tokens/${encodeURIComponent(purchaseToken)}:cancel`;
  const resp = await fetch(url, { method: "POST", headers: await authHeader(), body: "{}" });
  if (!resp.ok) {
    console.error("Google Play cancel error", resp.status, await resp.text().catch(() => ""));
    throw new BillingError(502, "Could not stop the previous subscription from renewing.");
  }
}

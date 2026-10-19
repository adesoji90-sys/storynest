// Quick checks of the subscription rules. Run: npx tsx scripts/test-billing.ts
import assert from "node:assert/strict";
import { interpretSubscription } from "../lib/billing/googlePlay";

const now = new Date("2026-11-01T12:00:00Z");
const future = "2026-12-01T12:00:00Z";
const past = "2026-10-01T12:00:00Z";
const mk = (state: string, expiry: string, extra: object = {}) => ({
  subscriptionState: state,
  startTime: "2026-10-01T12:00:00Z",
  lineItems: [{ productId: "evoke_family", expiryTime: expiry, autoRenewingPlan: { autoRenewEnabled: true } }],
  externalAccountIdentifiers: { obfuscatedExternalAccountId: "11111111-1111-4111-8111-111111111111" },
  acknowledgementState: "ACKNOWLEDGEMENT_STATE_PENDING",
  ...extra,
});

let r = interpretSubscription(mk("SUBSCRIPTION_STATE_ACTIVE", future), now);
assert.equal(r.entitled, true); assert.equal(r.status, "ACTIVE"); assert.equal(r.acknowledged, false);
assert.equal(r.accountId, "11111111-1111-4111-8111-111111111111"); assert.equal(r.productId, "evoke_family");

r = interpretSubscription(mk("SUBSCRIPTION_STATE_ACTIVE", past), now);
assert.equal(r.entitled, false, "active but already past expiry must not grant access");

r = interpretSubscription(mk("SUBSCRIPTION_STATE_IN_GRACE_PERIOD", future), now);
assert.equal(r.entitled, true); assert.equal(r.status, "PAST_DUE");

r = interpretSubscription(mk("SUBSCRIPTION_STATE_CANCELED", future, { lineItems: [{ productId: "evoke_family", expiryTime: future, autoRenewingPlan: { autoRenewEnabled: false } }] }), now);
assert.equal(r.entitled, true, "cancelled keeps access until the paid period ends"); assert.equal(r.status, "CANCELLED"); assert.equal(r.autoRenew, false);

r = interpretSubscription(mk("SUBSCRIPTION_STATE_CANCELED", past), now);
assert.equal(r.entitled, false); assert.equal(r.status, "EXPIRED");

for (const s of ["SUBSCRIPTION_STATE_ON_HOLD", "SUBSCRIPTION_STATE_PAUSED", "SUBSCRIPTION_STATE_EXPIRED"]) {
  r = interpretSubscription(mk(s, future), now);
  assert.equal(r.entitled, false, s);
}

r = interpretSubscription(mk("SUBSCRIPTION_STATE_PENDING", future), now);
assert.equal(r.entitled, false); assert.equal(r.pending, true);

r = interpretSubscription(mk("SUBSCRIPTION_STATE_ACTIVE", future, { acknowledgementState: "ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED", testPurchase: {} }), now);
assert.equal(r.acknowledged, true); assert.equal(r.isTest, true);

r = interpretSubscription({}, now);
assert.equal(r.entitled, false); assert.equal(r.productId, null);
console.log("billing rules: all checks passed");

// --- plans and monthly library limit ---
import { planCodeForProduct } from "../lib/billing/googlePlay";
import { monthWindow } from "../lib/checkLibraryReadAllowed";
assert.equal(planCodeForProduct("evoke_standard"), "standard");
assert.equal(planCodeForProduct("evoke_family"), "family");
assert.equal(planCodeForProduct("something_else"), null);
// 31 Oct 23:30 UTC is already 1 Nov in Nigeria (UTC+1), so a new month has started.
let w = monthWindow(new Date("2026-10-31T23:30:00Z"));
assert.equal(w.start.toISOString(), "2026-10-31T23:00:00.000Z");
assert.equal(w.next.toISOString(), "2026-11-30T23:00:00.000Z");
w = monthWindow(new Date("2026-10-18T12:00:00Z"));
assert.equal(w.start.toISOString(), "2026-09-30T23:00:00.000Z");
assert.equal(w.next.toISOString(), "2026-10-31T23:00:00.000Z");
console.log("plan + library-month checks passed");

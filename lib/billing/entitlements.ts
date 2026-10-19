// Turns a checked Google Play purchase into the family's plan and limits.
//
// Same model the rest of the app already uses: a Subscription row (who pays,
// until when) plus an Entitlement row (what the family may do right now).
// Nothing a family has made is ever deleted when a plan ends: on expiry the
// Entitlement simply goes back to the "reader" limits (see the schema notes).
import { prisma } from "@/lib/prisma";
import {
  BillingError,
  InterpretedSubscription,
  acknowledgeSubscription,
  fetchSubscription,
  interpretSubscription,
  planCodeForProduct,
  stopRenewal,
} from "./googlePlay";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const PROVIDER = "google_play";

export type SyncResult = {
  familyId: string;
  entitled: boolean;
  status: string;
  expiresAt: Date | null;
  autoRenew: boolean;
  pending: boolean;
};

async function resolveFamilyId(
  info: InterpretedSubscription,
  purchaseToken: string,
  expectedFamilyId?: string
): Promise<string | null> {
  if (info.accountId && UUID_RE.test(info.accountId)) {
    const fam = await prisma.family.findUnique({ where: { id: info.accountId }, select: { id: true } });
    if (fam) return fam.id;
  }
  // Renewals and plan changes can arrive with a new token: follow the old one.
  const tokens = [purchaseToken, info.linkedPurchaseToken].filter(Boolean) as string[];
  if (tokens.length) {
    const existing = await prisma.subscription.findFirst({
      where: { provider: PROVIDER, providerSubscriptionId: { in: tokens } },
      select: { familyId: true },
    });
    if (existing) return existing.familyId;
  }
  return expectedFamilyId ?? null;
}

// Check the purchase with Google, update the family's plan, and acknowledge it.
// expectedFamilyId is set when a signed-in parent is verifying their own purchase.
export async function syncGooglePlayPurchase(
  purchaseToken: string,
  expectedFamilyId?: string
): Promise<SyncResult | null> {
  const res = await fetchSubscription(purchaseToken);
  const info = interpretSubscription(res);

  const planCode = planCodeForProduct(info.productId);
  if (!planCode || !info.productId) {
    throw new BillingError(400, "This purchase is not for an Evoke plan.");
  }

  const familyId = await resolveFamilyId(info, purchaseToken, expectedFamilyId);
  if (!familyId) {
    console.error("Google Play purchase could not be matched to a family");
    return null;
  }
  if (expectedFamilyId && familyId !== expectedFamilyId) {
    throw new BillingError(403, "This purchase belongs to a different account.");
  }

  // One purchase can only unlock one family.
  const clash = await prisma.subscription.findFirst({
    where: { provider: PROVIDER, providerSubscriptionId: purchaseToken, NOT: { familyId } },
    select: { id: true },
  });
  if (clash) throw new BillingError(409, "This purchase is already linked to another account.");

  const [paidPlan, readerPlan] = await Promise.all([
    prisma.plan.findUnique({ where: { code: planCode } }),
    prisma.plan.findUnique({ where: { code: "reader" } }),
  ]);
  if (!paidPlan || !readerPlan) throw new BillingError(500, "Plans are not set up yet.");

  const current = await prisma.subscription.findUnique({ where: { familyId } });
  if (current && current.provider !== PROVIDER && current.status === "ACTIVE") {
    throw new BillingError(409, "This account already has an active plan.");
  }

  // A different, older purchase (for example the Standard plan after the family
  // moved up to Family) must never switch the plan back. Only a newer purchase
  // can replace the one on file.
  const currentIsLive = !!current && current.provider === PROVIDER && ["ACTIVE", "PAST_DUE", "CANCELLED"].includes(current.status) &&
    (!current.currentPeriodEnd || current.currentPeriodEnd.getTime() > Date.now());
  const differentToken =
    !!current?.providerSubscriptionId &&
    current.providerSubscriptionId !== purchaseToken &&
    current.providerSubscriptionId !== info.linkedPurchaseToken;
  if (currentIsLive && differentToken) {
    const olderPurchase = !!info.startTime && !!current!.startDate && info.startTime.getTime() < current!.startDate.getTime();
    if (!info.entitled || olderPurchase) {
      return {
        familyId,
        entitled: true,
        status: current!.status,
        expiresAt: current!.currentPeriodEnd,
        autoRenew: !current!.cancelAtPeriodEnd,
        pending: false,
      };
    }
  }

  if (info.pending) {
    // Payment (for example cash-style methods) has not finished. Nothing to grant yet.
    return { familyId, entitled: false, status: "NONE", expiresAt: null, autoRenew: false, pending: true };
  }

  const newPeriod = !current || current.currentPeriodEnd?.getTime() !== info.expiryTime?.getTime();
  const limits = info.entitled ? paidPlan : readerPlan;

  await prisma.$transaction(async (tx) => {
    const subscription = await tx.subscription.upsert({
      where: { familyId },
      create: {
        familyId,
        planId: paidPlan.id,
        provider: PROVIDER,
        providerSubscriptionId: purchaseToken,
        status: info.status,
        startDate: info.startTime,
        currentPeriodStart: info.startTime,
        currentPeriodEnd: info.expiryTime,
        cancelAtPeriodEnd: info.entitled && !info.autoRenew,
        cancelledAt: info.status === "CANCELLED" ? new Date() : null,
      },
      update: {
        planId: paidPlan.id,
        provider: PROVIDER,
        providerSubscriptionId: purchaseToken,
        status: info.status,
        ...(differentToken ? { startDate: info.startTime, currentPeriodStart: info.startTime } : {}),
        currentPeriodEnd: info.expiryTime,
        cancelAtPeriodEnd: info.entitled && !info.autoRenew,
        cancelledAt: info.status === "CANCELLED" ? (current?.cancelledAt ?? new Date()) : null,
      },
    });

    const entitlementData = {
      subscriptionId: info.entitled ? subscription.id : null,
      maxChildren: limits.maxChildren,
      libraryAccess: limits.libraryAccess,
      libraryBooksPerMonth: limits.libraryBooksPerMonth,
      customBooksAllowed: limits.customBooksAllowed,
      customBookCreditsTotal: limits.customBookCredits,
      narrationAllowed: limits.narrationAllowed,
      premiumImagesAllowed: limits.premiumImagesAllowed,
      printOrdersAllowed: limits.printOrdersAllowed,
      periodResetsAt: info.entitled ? info.expiryTime : null,
    };
    await tx.entitlement.upsert({
      where: { familyId },
      create: { familyId, ...entitlementData },
      update: {
        ...entitlementData,
        // A new paid period starts the custom-book credits again.
        ...(info.entitled && newPeriod ? { customBookCreditsUsed: 0 } : {}),
      },
    });
  });

  if (info.entitled && !info.acknowledged) {
    await acknowledgeSubscription(info.productId, purchaseToken);
  }

  // Moving to a different plan: stop the previous one from renewing so the family
  // is not billed twice. It stays usable in Google Play until its paid period ends.
  if (info.entitled && currentIsLive && differentToken && current?.providerSubscriptionId) {
    try {
      const oldRes = await fetchSubscription(current.providerSubscriptionId);
      const oldInfo = interpretSubscription(oldRes);
      if (oldInfo.productId && oldInfo.autoRenew) await stopRenewal(oldInfo.productId, current.providerSubscriptionId);
    } catch (err) {
      console.error("Could not stop the previous subscription from renewing", err);
    }
  }

  return {
    familyId,
    entitled: info.entitled,
    status: info.status,
    expiresAt: info.expiryTime,
    autoRenew: info.autoRenew,
    pending: false,
  };
}

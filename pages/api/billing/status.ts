// GET /api/billing/status: the signed-in family's current plan, for the upgrade page.
import type { NextApiRequest, NextApiResponse } from "next";
import { requireFamily } from "@/lib/authFamily";
import { prisma } from "@/lib/prisma";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  const auth = await requireFamily(req);
  if (!auth.ok) return res.status(auth.status).json({ error: auth.error });

  const [sub, ent] = await Promise.all([
    prisma.subscription.findUnique({ where: { familyId: auth.familyId }, include: { plan: { select: { code: true, name: true } } } }),
    prisma.entitlement.findUnique({ where: { familyId: auth.familyId }, select: { customBooksAllowed: true, maxChildren: true, libraryBooksPerMonth: true } }),
  ]);

  const paid = !!sub && ["ACTIVE", "PAST_DUE", "CANCELLED"].includes(sub.status) &&
    (!sub.currentPeriodEnd || sub.currentPeriodEnd.getTime() > Date.now());
  const code = paid ? sub!.plan.code : "reader";
  return res.status(200).json({
    familyId: auth.familyId, // used as the Play account id when buying
    planCode: code, // "reader" (free), "standard" or "family"
    onFamilyPlan: code === "family",
    onStandardPlan: code === "standard",
    provider: sub?.provider ?? null,
    status: sub?.status ?? "NONE",
    renewsOrEndsAt: sub?.currentPeriodEnd ?? null,
    willRenew: sub ? !sub.cancelAtPeriodEnd : false,
  });
}

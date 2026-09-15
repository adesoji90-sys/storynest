// GET /api/admin/dashboard
// Reuses data that was already being written (GenerationJob per
// illustrate/narrate run, AIUsageRecord per individual AI call) but
// never had anywhere to actually be SEEN before this — this route
// doesn't create any new tracking, just surfaces what already exists.
import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/authAdmin";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  const auth = await requireAdmin(req);
  if (!auth.ok) {
    return res.status(auth.status).json({ error: auth.error });
  }

  const [recentJobs, activeJobs, costByOperation, totalBooks, totalCurated, totalCustom, printOrdersByStatus, familiesByTier, totalFamilies, costByBookRaw] = await Promise.all([
    prisma.generationJob.findMany({
      orderBy: { startedAt: "desc" },
      take: 20,
      include: { book: { select: { title: true } } },
    }),
    prisma.generationJob.count({ where: { status: "PROCESSING" } }),
    prisma.aIUsageRecord.groupBy({
      by: ["operationType"],
      _sum: { estimatedCostMinorUnits: true },
      _count: { id: true },
    }),
    prisma.book.count(),
    prisma.book.count({ where: { type: "CURATED" } }),
    prisma.book.count({ where: { type: "CUSTOM" } }),
    prisma.printOrder.groupBy({
      by: ["status"],
      where: { status: { not: "pending_payment" } }, // abandoned carts aren't revenue and aren't actionable — same reasoning as the admin print-orders list itself
      _sum: { priceMinorUnits: true },
      _count: { id: true },
    }),
    // No direct planId/planCode on Entitlement (it copies a plan's
    // values at creation time rather than holding a live reference —
    // see bootstrap.ts's createDefaultEntitlement) — customBooksAllowed
    // works as a proxy for "which tier" since it's the one field that
    // reliably differs between the two current plans (Reader: always
    // false, Family: always true). If a third plan is ever added with
    // its own distinct combination, this stops being a clean proxy and
    // would need a real join instead.
    prisma.entitlement.groupBy({
      by: ["customBooksAllowed"],
      _count: { id: true },
    }),
    prisma.family.count(),
    // Top 20 by total spend, not every book with a cost record — a
    // book that's had text generated, illustrated, AND narrated could
    // easily rack up 20+ individual AIUsageRecord rows on its own, and
    // this dashboard is for spotting the expensive outliers, not
    // auditing every book ever touched.
    prisma.aIUsageRecord.groupBy({
      by: ["bookId"],
      where: { bookId: { not: null } },
      _sum: { estimatedCostMinorUnits: true },
      _count: { id: true },
      orderBy: { _sum: { estimatedCostMinorUnits: "desc" } },
      take: 20,
    }),
  ]);

  const costByBookBookIds = costByBookRaw.map((c: any) => c.bookId).filter(Boolean);
  const booksForCost = costByBookBookIds.length
    ? await prisma.book.findMany({ where: { id: { in: costByBookBookIds } }, select: { id: true, title: true, type: true } })
    : [];
  const bookById = Object.fromEntries(booksForCost.map((b: any) => [b.id, b]));
  const costByBook = costByBookRaw.map((c: any) => ({
    bookId: c.bookId,
    title: bookById[c.bookId]?.title || "Deleted book",
    type: bookById[c.bookId]?.type || null,
    totalCostMinorUnits: c._sum.estimatedCostMinorUnits || 0,
    operationCount: c._count.id,
  }));

  return res.status(200).json({
    recentJobs,
    activeJobCount: activeJobs,
    costByOperation: costByOperation.map((c: any) => ({
      operationType: c.operationType,
      totalCostMinorUnits: c._sum.estimatedCostMinorUnits || 0,
      count: c._count.id,
    })),
    costByBook,
    totalBooks,
    totalCurated,
    totalCustom,
    printOrdersByStatus: printOrdersByStatus.map((p: any) => ({
      status: p.status,
      totalRevenueMinorUnits: p._sum.priceMinorUnits || 0,
      count: p._count.id,
    })),
    familiesByTier: familiesByTier.map((f: any) => ({
      tier: f.customBooksAllowed ? "Family" : "Reader",
      count: f._count.id,
    })),
    totalFamilies,
  });
}

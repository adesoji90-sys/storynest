// Limits how many different library books a family can open each month.
//
// The free plan allows 1 library book per calendar month (Nigeria time).
// Standard and Family have no limit (libraryBooksPerMonth is null).
// Re-opening a book already started this month is always allowed, and books
// the family made themselves are never counted.
import { prisma } from "@/lib/prisma";

export type LibraryReadCheck =
  | { ok: true }
  | { ok: false; status: number; error: string; code: "LIBRARY_LIMIT" | "NO_LIBRARY"; limit?: number; resetsAt?: string };

// First moment of the current month in Nigeria (UTC+1, no daylight saving).
export function monthWindow(now: Date = new Date()): { start: Date; next: Date } {
  const lagos = new Date(now.getTime() + 60 * 60 * 1000);
  const y = lagos.getUTCFullYear();
  const m = lagos.getUTCMonth();
  return {
    start: new Date(Date.UTC(y, m, 1) - 60 * 60 * 1000),
    next: new Date(Date.UTC(y, m + 1, 1) - 60 * 60 * 1000),
  };
}

export async function checkLibraryReadAllowed(
  familyId: string,
  bookId: string,
  bookType: string,
  now: Date = new Date()
): Promise<LibraryReadCheck> {
  if (bookType !== "CURATED") return { ok: true };

  const ent = await prisma.entitlement.findUnique({
    where: { familyId },
    select: { libraryAccess: true, libraryBooksPerMonth: true },
  });
  // Same rule as the other checks: no entitlement row means no restriction.
  if (!ent) return { ok: true };
  if (!ent.libraryAccess) {
    return { ok: false, status: 403, code: "NO_LIBRARY", error: "The library isn't included in this plan." };
  }
  if (ent.libraryBooksPerMonth == null) return { ok: true };

  const { start, next } = monthWindow(now);
  const opened = await prisma.readingSession.findMany({
    where: {
      startedAt: { gte: start, lt: next },
      child: { familyId },
      book: { type: "CURATED" },
    },
    distinct: ["bookId"],
    select: { bookId: true },
  });
  if (opened.some((o) => o.bookId === bookId)) return { ok: true };
  if (opened.length < ent.libraryBooksPerMonth) return { ok: true };

  const n = ent.libraryBooksPerMonth;
  return {
    ok: false,
    status: 403,
    code: "LIBRARY_LIMIT",
    limit: n,
    resetsAt: next.toISOString(),
    error: `This month's ${n === 1 ? "free book has" : `${n} free books have`} already been read. A parent can unlock the whole library with the Standard plan.`,
  };
}

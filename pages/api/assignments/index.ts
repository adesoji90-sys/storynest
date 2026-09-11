// GET/POST /api/assignments
//
// GET  ?childId=X — lists that child's ACTIVE assignments, with book
//      metadata joined in. Used by /family (assigned books per child)
//      and /library (to show "Already assigned" instead of "Assign"
//      for books a child already has).
// POST { bookId, childId } — assigns a book to a child.
//
// SECURITY: every operation checks the given childId actually belongs
// to the caller's own family before doing anything with it — the same
// "resolve identity from the verified session, never trust a
// client-supplied id alone" principle as lib/authFamily.ts's other
// consumers. A childId from another family fails this check and the
// route responds as if that child simply doesn't exist, not with any
// more specific detail.

import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireFamily } from "@/lib/authFamily";

const CreateAssignmentSchema = z.object({
  bookId: z.string().uuid(),
  childId: z.string().uuid(),
});

async function childBelongsToFamily(childId: string, familyId: string) {
  const child = await prisma.child.findFirst({ where: { id: childId, familyId }, select: { id: true } });
  return !!child;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const auth = await requireFamily(req);
  if (!auth.ok) {
    return res.status(auth.status).json({ error: auth.error });
  }

  if (req.method === "GET") {
    const { childId } = req.query;
    if (typeof childId !== "string") {
      return res.status(400).json({ error: "childId is required." });
    }
    if (!(await childBelongsToFamily(childId, auth.familyId))) {
      return res.status(404).json({ error: "Child not found." });
    }

    try {
      const assignments = await prisma.bookAssignment.findMany({
        where: { childId, status: "ACTIVE" },
        orderBy: { assignedAt: "desc" },
        include: {
          book: {
            select: {
              id: true,
              title: true,
              subtitle: true,
              ageRangeMin: true,
              ageRangeMax: true,
              readingLevel: true,
              category: true,
              _count: { select: { pages: true } },
            },
          },
        },
      });

      // ReadingProgress has no direct Prisma relation to BookAssignment
      // (both are independently keyed by childId+bookId, not linked to
      // each other) — fetched separately and merged in here so the
      // caller gets "how far has this child gotten" alongside "what's
      // assigned" in one response, without the client needing a second
      // round-trip per book.
      const bookIds = assignments.map((a: { bookId: string }) => a.bookId);
      const progressRows = bookIds.length
        ? await prisma.readingProgress.findMany({ where: { childId, bookId: { in: bookIds } } })
        : [];
      const progressByBookId = Object.fromEntries(progressRows.map((p: { bookId: string }) => [p.bookId, p]));

      const withProgress = assignments.map((a: { bookId: string }) => ({
        ...a,
        progress: progressByBookId[a.bookId]
          ? {
              percentage: progressByBookId[a.bookId].percentage,
              completedAt: progressByBookId[a.bookId].completedAt,
            }
          : null,
      }));

      return res.status(200).json({ assignments: withProgress });
    } catch (err) {
      console.error("assignments GET error:", err);
      return res.status(500).json({ error: "Unexpected server error." });
    }
  }

  if (req.method === "POST") {
    const parsed = CreateAssignmentSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message || "Invalid input." });
    }
    const { bookId, childId } = parsed.data;

    if (!(await childBelongsToFamily(childId, auth.familyId))) {
      return res.status(404).json({ error: "Child not found." });
    }

    const book = await prisma.book.findUnique({ where: { id: bookId }, select: { status: true, type: true } });
    if (!book || book.type !== "CURATED" || book.status !== "PUBLISHED") {
      return res.status(404).json({ error: "Book not available." });
    }

    try {
      // Reactivates a previously-removed assignment instead of erroring
      // on the unique (bookId, childId) constraint — unassigning and
      // reassigning the same book to the same child is a normal action,
      // not an edge case to reject.
      const assignment = await prisma.bookAssignment.upsert({
        where: { bookId_childId: { bookId, childId } },
        update: { status: "ACTIVE", assignedByUserId: auth.userId, assignedAt: new Date() },
        create: { bookId, childId, assignedByUserId: auth.userId, status: "ACTIVE" },
      });
      return res.status(201).json({ assignment });
    } catch (err) {
      console.error("assignments POST error:", err);
      return res.status(500).json({ error: "Unexpected server error." });
    }
  }

  return res.status(405).json({ error: "Method not allowed" });
}

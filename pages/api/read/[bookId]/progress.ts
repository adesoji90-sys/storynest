// POST /api/read/[bookId]/progress
// Body: { childId, sessionId, currentPage }
//
// Updates the running ReadingProgress (Section 8: "do not rely solely
// on one percentage field" — this recomputes percentage from actual
// page count rather than trusting a client-supplied one) and the
// ReadingSession started by the GET call, incrementing pagesRead and
// bumping endedAt each turn. Reaching the last page sets completedAt.
//
// SECURITY: same childId-belongs-to-family check as every other
// family-scoped route, plus the sessionId and the progress row must
// both actually belong to this childId — a session or progress row for
// a different child (even within the same family, e.g. a sibling)
// can't be updated through a mismatched id.

import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireFamily } from "@/lib/authFamily";

const ProgressSchema = z.object({
  childId: z.string().uuid(),
  sessionId: z.string().uuid(),
  currentPage: z.number().int().min(1),
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { bookId } = req.query;
  if (typeof bookId !== "string") {
    return res.status(400).json({ error: "Invalid book id." });
  }

  const auth = await requireFamily(req);
  if (!auth.ok) {
    return res.status(auth.status).json({ error: auth.error });
  }

  const parsed = ProgressSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message || "Invalid input." });
  }
  const { childId, sessionId, currentPage } = parsed.data;

  try {
    const child = await prisma.child.findFirst({ where: { id: childId, familyId: auth.familyId }, select: { id: true } });
    if (!child) {
      return res.status(404).json({ error: "Child not found." });
    }

    // Same gate as the GET reader endpoint — without this, progress
    // could still be recorded against a book that's been unassigned
    // since the reader was opened (the ReadingProgress row from the
    // original session persists by design, per Section 2's "never
    // delete history," but that's not the same as still having access).
    const assignment = await prisma.bookAssignment.findFirst({
      where: { bookId, childId, status: "ACTIVE" },
      select: { id: true },
    });
    if (!assignment) {
      return res.status(403).json({ error: "This book isn't assigned to this child." });
    }

    const totalPages = await prisma.page.count({ where: { bookId } });
    if (totalPages === 0) {
      return res.status(404).json({ error: "Book not found." });
    }
    const clampedPage = Math.min(currentPage, totalPages);
    const percentage = Math.round((clampedPage / totalPages) * 100);
    const isComplete = clampedPage >= totalPages;

    const progressUpdate = await prisma.readingProgress.updateMany({
      where: { childId, bookId },
      data: {
        currentPage: clampedPage,
        percentage,
        lastReadAt: new Date(),
        ...(isComplete ? { completedAt: new Date() } : {}),
      },
    });
    if (progressUpdate.count === 0) {
      return res.status(404).json({ error: "No reading progress found — open the book from the library first." });
    }

    await prisma.readingSession.updateMany({
      where: { id: sessionId, childId, bookId },
      data: { endedAt: new Date(), pagesRead: clampedPage },
    });

    return res.status(200).json({ currentPage: clampedPage, percentage, completed: isComplete });
  } catch (err) {
    console.error("read progress POST error:", err);
    return res.status(500).json({ error: "Unexpected server error." });
  }
}

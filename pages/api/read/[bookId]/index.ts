// GET /api/read/[bookId]?childId=X
//
// Returns a book's pages for reading — but ONLY if childId actually has
// an ACTIVE assignment for this book, and childId belongs to the
// caller's own family. This is the real gate that makes "children read
// through assignments, not by browsing any book directly" (Section 5's
// Book-as-reusable-asset model) actually enforced server-side, not just
// implied by which buttons the UI happens to show.
//
// Also resolves (and creates if missing) this child's ReadingProgress
// for the book, and starts a new ReadingSession for this sitting —
// Section 8's explicit requirement to track both the running state
// (ReadingProgress: current page, percentage) and historical sessions
// (ReadingSession), not rely on one field alone. The returned
// sessionId is what /api/read/[bookId]/progress updates as pages turn.

import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "@/lib/prisma";
import { requireFamily } from "@/lib/authFamily";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { bookId, childId } = req.query;
  if (typeof bookId !== "string" || typeof childId !== "string") {
    return res.status(400).json({ error: "bookId and childId are required." });
  }

  const auth = await requireFamily(req);
  if (!auth.ok) {
    return res.status(auth.status).json({ error: auth.error });
  }

  try {
    const assignment = await prisma.bookAssignment.findFirst({
      where: { bookId, childId, status: "ACTIVE", child: { familyId: auth.familyId } },
    });
    if (!assignment) {
      return res.status(403).json({ error: "This book isn't assigned to this child." });
    }

    const book = await prisma.book.findUnique({
      where: { id: bookId },
      select: {
        id: true,
        title: true,
        pages: { orderBy: { pageNumber: "asc" }, select: { id: true, pageNumber: true, text: true } },
      },
    });
    if (!book) {
      return res.status(404).json({ error: "Book not found." });
    }

    const progress = await prisma.readingProgress.upsert({
      where: { childId_bookId: { childId, bookId } },
      update: { lastReadAt: new Date() },
      create: { childId, bookId, currentPage: 1 },
    });

    const session = await prisma.readingSession.create({
      data: { childId, bookId, pagesRead: 0 },
    });

    return res.status(200).json({
      book: { id: book.id, title: book.title, pages: book.pages },
      progress: {
        currentPage: progress.currentPage,
        percentage: progress.percentage,
        completedAt: progress.completedAt,
      },
      sessionId: session.id,
    });
  } catch (err) {
    console.error("read GET error:", err);
    return res.status(500).json({ error: "Unexpected server error." });
  }
}

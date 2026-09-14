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
import { createClient } from "@supabase/supabase-js";
import { prisma } from "@/lib/prisma";
import { requireFamily } from "@/lib/authFamily";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.SUPABASE_SERVICE_ROLE_KEY as string
);

// Same 30-day signed-URL TTL and reasoning as the old pipeline's
// generate-illustrations.js: long enough that a parent returning to a
// book weeks later doesn't hit an expired link, short enough not to
// leave an indefinite-lifetime link floating around for content that
// can depict a real child's implied likeness.
const SIGNED_URL_TTL_SECONDS = 60 * 60 * 24 * 30;

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
        pages: {
          orderBy: { pageNumber: "asc" },
          select: {
            id: true,
            pageNumber: true,
            text: true,
            illustrationAsset: { select: { bucket: true, storageKey: true } },
          },
        },
      },
    });
    if (!book) {
      return res.status(404).json({ error: "Book not found." });
    }

    // Resolved to a signed URL here, not left as a bucket/key pair —
    // the reader page just needs an <img src>, and the private-bucket
    // access check belongs entirely server-side, not something the
    // client should ever need to know how to do itself.
    const pagesWithUrls = await Promise.all(
      book.pages.map(async (page: any) => {
        if (!page.illustrationAsset) {
          return { id: page.id, pageNumber: page.pageNumber, text: page.text, illustrationUrl: null };
        }
        const { data } = await supabaseAdmin.storage
          .from(page.illustrationAsset.bucket)
          .createSignedUrl(page.illustrationAsset.storageKey, SIGNED_URL_TTL_SECONDS);
        return {
          id: page.id,
          pageNumber: page.pageNumber,
          text: page.text,
          illustrationUrl: data?.signedUrl || null,
        };
      })
    );

    const progress = await prisma.readingProgress.upsert({
      where: { childId_bookId: { childId, bookId } },
      update: { lastReadAt: new Date() },
      create: { childId, bookId, currentPage: 1 },
    });

    const session = await prisma.readingSession.create({
      data: { childId, bookId, pagesRead: 0 },
    });

    return res.status(200).json({
      book: { id: book.id, title: book.title, pages: pagesWithUrls },
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

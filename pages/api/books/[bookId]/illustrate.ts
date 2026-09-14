// POST /api/books/[bookId]/illustrate
//
// Manually triggered, deliberately not automatic on story approval —
// every page costs real money to illustrate, so a parent decides when
// to spend it rather than it happening invisibly the moment a story is
// approved. Scoped to CUSTOM (personalized) books only in this first
// pass: a curated book has no specific child to build a character
// reference from, and admin-side illustration is real, separate scope
// for a later pass, not squeezed into this one.
//
// Same 280s/Fluid Compute requirement as the old pipeline's
// generate-illustrations.js, for the identical reason: sequential
// generation (one page at a time, matching that route's own
// hard-learned CONCURRENCY=1 lesson about OpenAI's rate limits) takes
// real wall-clock time across several pages, more than Vercel's
// standard 60s ceiling allows.
export const config = {
  maxDuration: 280,
};

import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "@/lib/prisma";
import { requireFamily } from "@/lib/authFamily";
import { getOrCreateChildCharacterBible, getOrGenerateCharacterReferenceBase64, illustratePage } from "@/lib/illustration";

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

  const book = await prisma.book.findFirst({
    where: { id: bookId, familyId: auth.familyId, type: "CUSTOM" },
    include: { story: true, pages: { orderBy: { pageNumber: "asc" } } },
  });
  if (!book) {
    return res.status(404).json({ error: "Book not found." });
  }
  if (!book.story?.childId) {
    return res.status(400).json({ error: "This book has no child to illustrate for." });
  }
  if (book.pages.length === 0) {
    return res.status(400).json({ error: "This book has no pages yet." });
  }

  // A persisted, auditable record of this operation even though it's
  // processed synchronously within this same request rather than
  // dispatched to a background worker — Vercel's Hobby-tier Cron limits
  // (once per day) make a real async queue impractical on this
  // deployment right now, but GenerationJob still gives visibility and
  // a real record if something fails partway through, rather than
  // nothing persisting at all the way the old pipeline's in-request-only
  // results did.
  const job = await prisma.generationJob.create({
    data: {
      familyId: auth.familyId,
      bookId: book.id,
      jobType: "IMAGE_GENERATION",
      status: "PROCESSING",
      startedAt: new Date(),
    },
  });

  try {
    const characterBible = await getOrCreateChildCharacterBible(book.story.childId, auth.familyId);
    // Always ensure "neutral" exists first, before any page's pose
    // selection runs — every other pose is generated as an edit of
    // this one (see getOrGenerateCharacterReferenceBase64), so it needs
    // to exist before any page that isn't itself "neutral" is
    // processed, not just whichever pose the first page happens to
    // select.
    await getOrGenerateCharacterReferenceBase64(characterBible, auth.familyId, "neutral");

    const results: { pageId: string; ok: boolean; error?: string }[] = [];
    // Sequential, not concurrent — the old pipeline's own hard-learned
    // lesson (see generate-illustrations.js's CONCURRENCY constant):
    // several image generations fired together trips OpenAI's rate
    // limit on anything but a high account tier.
    for (const page of book.pages) {
      if (!page.text) {
        results.push({ pageId: page.id, ok: false, error: "Page has no text." });
        continue;
      }
      try {
        await illustratePage({
          pageId: page.id,
          pageText: page.text,
          characterBible,
          familyId: auth.familyId,
          userId: auth.userId,
          bookId: book.id,
        });
        results.push({ pageId: page.id, ok: true });
      } catch (pageErr) {
        console.error(`Illustration failed for page ${page.id}:`, pageErr);
        results.push({ pageId: page.id, ok: false, error: (pageErr as Error).message });
      }
    }

    const failedCount = results.filter((r) => !r.ok).length;
    await prisma.generationJob.update({
      where: { id: job.id },
      data: {
        status: failedCount === results.length ? "FAILED" : "COMPLETED",
        completedAt: new Date(),
        resultJson: results,
      },
    });

    return res.status(200).json({ results, failedCount });
  } catch (err) {
    console.error("illustrate error:", err);
    await prisma.generationJob.update({
      where: { id: job.id },
      data: { status: "FAILED", completedAt: new Date(), errorMessage: (err as Error).message },
    });
    return res.status(500).json({ error: (err as Error).message || "Unexpected server error." });
  }
}

// POST /api/books/[bookId]/illustrate
//
// RESTRUCTURED: this used to illustrate every page itself, in one long-
// blocking request — which is exactly what kept timing out. A single
// request has a hard ceiling no matter how high maxDuration is set (300s
// still wasn't enough for a book with several pages and supporting
// characters), so this is no longer a "do the whole book" endpoint.
// Now it just does the fast setup work (validate, create the tracking
// job, ensure the main character's neutral reference exists) and hands
// back the list of page ids that still need illustrating. The actual
// per-page work happens in illustrate-page.ts, called once per page BY
// THE CLIENT in a loop — each of those calls is short enough to comfortably
// finish well under even a 60s ceiling, so the book's total length no
// longer determines whether any single request times out.
//
// Manually triggered, deliberately not automatic on story approval —
// every page costs real money to illustrate, so a parent decides when
// to spend it rather than it happening invisibly the moment a story is
// approved. Scoped to CUSTOM (personalized) books only in this first
// pass: a curated book has no specific child to build a character
// reference from, and admin-side illustration is real, separate scope
// for a later pass, not squeezed into this one.
export const config = {
  maxDuration: 60, // only setup work now, not per-page generation — this should never come close to even this
};

import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "@/lib/prisma";
import { requireFamily } from "@/lib/authFamily";
import { getOrCreateChildCharacterBible, getOrGenerateCharacterReferenceBase64 } from "@/lib/illustration";
import { isAncillaryPage } from "@/lib/ancillaryPages";

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
    include: {
      story: true,
      pages: { orderBy: { pageNumber: "asc" } },
      characters: { include: { character: true } },
    },
  });
  if (!book) {
    return res.status(404).json({ error: "Book not found." });
  }
  if (book.pages.length === 0) {
    return res.status(400).json({ error: "This book has no pages yet." });
  }

  try {
    // Same resolution as before (see illustrate-page.ts's matching
    // comment for why re-deriving this per-call is safe and cheap) —
    // done here too so "neutral" is guaranteed to exist before any
    // page-level request runs, rather than leaving a race where the
    // first couple of page calls might land before it's ready.
    const linkedCharacter = book.characters.find((bc: any) => bc.role === "main")?.character;
    const characterBible = linkedCharacter
      ? linkedCharacter
      : await (async () => {
          if (!book.story?.childId) {
            throw new Error("This book has no child or character to illustrate for.");
          }
          const firstPagesText = book.pages
            .slice(0, 2)
            .map((p: any) => p.text)
            .filter(Boolean)
            .join(" ");
          const theme = firstPagesText || ((book.story.brief as any)?.theme as string | undefined);
          return getOrCreateChildCharacterBible(book.story.childId, auth.familyId, theme);
        })();
    await getOrGenerateCharacterReferenceBase64(characterBible, auth.familyId, "neutral");

    const illustrablePages = book.pages.filter((p: any) => !isAncillaryPage(p.text || "") && p.text);

    const job = await prisma.generationJob.create({
      data: {
        familyId: auth.familyId,
        bookId: book.id,
        jobType: "IMAGE_GENERATION",
        status: "PROCESSING",
        startedAt: new Date(),
        resultJson: { completed: 0, total: illustrablePages.length, results: [] },
      },
    });

    return res.status(200).json({
      jobId: job.id,
      pageIds: illustrablePages.map((p: any) => p.id),
    });
  } catch (err) {
    console.error("illustrate setup error:", err);
    return res.status(500).json({ error: (err as Error).message || "Unexpected server error." });
  }
}

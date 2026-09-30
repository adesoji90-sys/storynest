// POST /api/books/[bookId]/illustrate-page
//
// The actual generation work, one page at a time — split out of
// illustrate.ts specifically to keep each individual request short
// enough to never hit a Vercel timeout regardless of how long the book
// is. The client (Story Studio's handleIllustrate) calls this once per
// page, in a sequential loop, driving the whole book's illustration
// itself rather than asking one request to do all of it internally.
//
// Body: { pageId, jobId }. jobId is the tracking row illustrate.ts
// already created — this just updates its progress after each page,
// same resultJson shape the generation-status polling endpoint already
// reads, so the progress modal keeps working exactly as before even
// though the underlying request structure changed completely.
export const config = {
  // One image (plus, occasionally, a first-time supporting-character
  // reference or two, now generated in parallel — see
  // lib/illustration.ts) comfortably finishes well under even Vercel's
  // short default ceiling. This is deliberately NOT raised to
  // accommodate a whole book the way the old single-request design
  // needed — that need is exactly what this split removes.
  maxDuration: 90,
};

import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireFamily } from "@/lib/authFamily";
import { getOrCreateChildCharacterBible, getOrGenerateCharacterReferenceBase64, generateBookCover, illustratePage } from "@/lib/illustration";

const BodySchema = z.object({
  pageId: z.string().uuid(),
  jobId: z.string().uuid(),
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

  const parsed = BodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "pageId and jobId are required." });
  }
  const { pageId, jobId } = parsed.data;

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
  const page = book.pages.find((p: any) => p.id === pageId);
  if (!page || !page.text) {
    return res.status(404).json({ error: "Page not found on this book." });
  }
  const job = await prisma.generationJob.findFirst({ where: { id: jobId, bookId: book.id, familyId: auth.familyId } });
  if (!job) {
    return res.status(404).json({ error: "Generation job not found." });
  }

  // Re-derived here rather than trusted from the client — cheap
  // (no image generation, just lookups and a possible single create),
  // and safe to repeat: getOrCreateChildCharacterBible and
  // getOrGenerateCharacterReferenceBase64 are both idempotent, so
  // calling them again on every single page request returns the same
  // already-created rows rather than duplicating anything. This keeps
  // each page request fully self-contained instead of depending on
  // client-supplied state that could be stale or tampered with.
  const linkedCharacter = book.characters.find((bc: any) => bc.role === "main")?.character;
  const supportingCharacters = book.characters
    .filter((bc: any) => bc.role === "supporting" && bc.character?.appearance)
    .map((bc: any) => bc.character);

  try {
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

    await illustratePage({
      pageId: page.id,
      pageText: page.text,
      characterBible,
      supportingCharacters,
      familyId: auth.familyId,
      userId: auth.userId,
      bookId: book.id,
    });

    const existingResult = (job.resultJson as any) || { completed: 0, total: 0, results: [] };
    const results = [...(existingResult.results || []), { pageId: page.id, ok: true }];
    const isLastPage = results.length >= existingResult.total;

    // Cover generated on the LAST page's request, not a separate step
    // the client has to remember to call — anchored to the same
    // reference every page used (see generateBookCover's own reasoning
    // for why this fixed a real cover/page mismatch bug), and safe to
    // attempt here even if a later page still fails independently,
    // since generateBookCover's own guard skips silently if the book
    // already has one.
    if (isLastPage) {
      const referenceBase64 = await getOrGenerateCharacterReferenceBase64(characterBible, auth.familyId, "neutral");
      await generateBookCover({
        bookId: book.id,
        title: book.title,
        characterBible,
        referenceBase64,
        familyId: auth.familyId,
        userId: auth.userId,
      });
    }

    await prisma.generationJob.update({
      where: { id: job.id },
      data: {
        resultJson: { completed: results.length, total: existingResult.total, results },
        ...(isLastPage ? { status: "COMPLETED", completedAt: new Date() } : {}),
      },
    });

    return res.status(200).json({ ok: true, completed: results.length, total: existingResult.total });
  } catch (err) {
    console.error(`illustrate-page error (page ${pageId}):`, err);
    const existingResult = (job.resultJson as any) || { completed: 0, total: 0, results: [] };
    const results = [...(existingResult.results || []), { pageId: page.id, ok: false, error: (err as Error).message }];
    await prisma.generationJob.update({
      where: { id: job.id },
      data: { resultJson: { completed: results.length, total: existingResult.total, results } },
    });
    return res.status(500).json({ error: (err as Error).message || "Couldn't illustrate this page." });
  }
}

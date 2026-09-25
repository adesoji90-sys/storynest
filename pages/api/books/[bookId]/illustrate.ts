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
  // Raised from 280 — the supporting-character consistency feature
  // added real extra time on top of the per-page illustration calls:
  // each distinct supporting character needs one reference-image
  // generation (cached after that, not repeated per page they appear
  // on), but for a longer book with several of them, that extra time
  // could now push a run right up against what used to be a safely
  // generous budget. 300 is Vercel's standard ceiling without Fluid
  // Compute enabled — if a run still times out at this limit, the next
  // step is restructuring this into a real background job rather than
  // one long-blocking request, not just raising the number further.
  maxDuration: 300,
};

import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "@/lib/prisma";
import { requireFamily } from "@/lib/authFamily";
import { getOrCreateChildCharacterBible, getOrGenerateCharacterReferenceBase64, generateBookCover, illustratePage } from "@/lib/illustration";
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
    // Checks for an explicitly-linked MAIN character first (set at
    // story-creation time if the parent picked one in Story Studio),
    // matching the same lookup order admin/curated illustration already
    // uses via getOrCreateGenericBookCharacterBible. Only falls back to
    // auto-deriving one from the child if no character was ever linked
    // — either an older book created before this change, or a parent
    // who didn't bother picking one, which is still a fully supported
    // path, not a removed feature.
    const linkedCharacter = book.characters.find((bc: any) => bc.role === "main")?.character;
    // Supporting characters — created during story approval from
    // whatever generate.ts identified in the story text (see
    // approve.ts's own comment). Filtered to real appearance data since
    // an empty/malformed entry shouldn't get passed into the image
    // generation call at all.
    const supportingCharacters = book.characters
      .filter((bc: any) => bc.role === "supporting" && bc.character?.appearance)
      .map((bc: any) => bc.character);
    const characterBible = linkedCharacter
      ? linkedCharacter
      : await (async () => {
          if (!book.story?.childId) {
            throw new Error("This book has no child or character to illustrate for.");
          }
          // Uses the ACTUAL generated/approved story content, not just
          // the brief's short theme string — the brief is what a
          // parent typed BEFORE Claude wrote anything (often just a
          // few words), while the real page text is far more specific
          // about who and what the story is actually about. This is
          // what makes a default character genuinely reflect the
          // story that got written, rather than a generic guess from
          // the original one-line prompt.
          const firstPagesText = book.pages
            .slice(0, 2)
            .map((p: any) => p.text)
            .filter(Boolean)
            .join(" ");
          const theme = firstPagesText || ((book.story.brief as any)?.theme as string | undefined);
          return getOrCreateChildCharacterBible(book.story.childId, auth.familyId, theme);
        })();
    // Always ensure "neutral" exists first, before any page's pose
    // selection runs — every other pose is generated as an edit of
    // this one (see getOrGenerateCharacterReferenceBase64), so it needs
    // to exist before any page that isn't itself "neutral" is
    // processed, not just whichever pose the first page happens to
    // select.
    const referenceBase64 = await getOrGenerateCharacterReferenceBase64(characterBible, auth.familyId, "neutral");

    const results: { pageId: string; ok: boolean; error?: string }[] = [];
    // Ancillary pages (the auto-appended questions page and closing
    // page — see lib/ancillaryPages.js's own comment) are excluded
    // entirely, not just from the count: they were never meant to be
    // illustrated like a story scene, and illustrating them would waste
    // real generation cost on pages that don't need it. This is also
    // the actual fix for a real reported bug — an author who wrote an
    // 8-page story saw "Page 5 of 10" in the progress modal, because
    // the book's 10 real Page rows included the 2 ancillary ones on
    // top of the 8 story pages the author actually thinks of as "the
    // book."
    const illustrablePages = book.pages.filter((p: any) => !isAncillaryPage(p.text || ""));
    // Sequential, not concurrent — the old pipeline's own hard-learned
    // lesson (see generate-illustrations.js's CONCURRENCY constant):
    // several image generations fired together trips OpenAI's rate
    // limit on anything but a high account tier.
    for (const page of illustrablePages) {
      if (!page.text) {
        results.push({ pageId: page.id, ok: false, error: "Page has no text." });
        continue;
      }
      try {
        await illustratePage({
          pageId: page.id,
          pageText: page.text,
          characterBible,
          supportingCharacters,
          familyId: auth.familyId,
          userId: auth.userId,
          bookId: book.id,
        });
        results.push({ pageId: page.id, ok: true });
      } catch (pageErr) {
        console.error(`Illustration failed for page ${page.id}:`, pageErr);
        results.push({ pageId: page.id, ok: false, error: (pageErr as Error).message });
      }
      // Same reasoning as narrate.ts's matching write — this is what a
      // separate, concurrent poll to /api/books/[bookId]/generation-status
      // actually reads while this request is still running.
      await prisma.generationJob.update({
        where: { id: job.id },
        data: { resultJson: { completed: results.length, total: illustrablePages.length, results } },
      });
    }

    // Cover generated LAST, after every page — not just anchored to the
    // same reference image (the real fix for cover/page mismatches,
    // same technique as page illustration itself), but deliberately
    // sequenced after the pages actually run, not before, so it's the
    // very last thing to use the established character rather than the
    // first, matching a real, reported case where the cover and pages
    // showed visibly different-looking characters. Still safe to call
    // on a retry — generateBookCover's own guard skips silently if the
    // book already has one.
    await generateBookCover({
      bookId: book.id,
      title: book.title,
      characterBible,
      referenceBase64,
      familyId: auth.familyId,
      userId: auth.userId,
    });


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

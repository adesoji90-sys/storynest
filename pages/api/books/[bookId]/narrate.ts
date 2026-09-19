// POST /api/books/[bookId]/narrate
//
// Manually triggered, same reasoning as illustrate.ts: real cost per
// page, so a parent decides when to spend it rather than it happening
// automatically. Deliberately independent of illustration — a parent
// can add narration without illustrating, or illustrate without
// narrating, or both; neither triggers the other.
export const config = {
  maxDuration: 280,
};

import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireFamily } from "@/lib/authFamily";
import { narratePage } from "@/lib/narration";
import { NARRATION_TONES, DEFAULT_NARRATION_TONE } from "@/lib/ai/NarrationProvider";

const NarrateSchema = z.object({
  tone: z.enum(Object.keys(NARRATION_TONES) as [string, ...string[]]).optional(),
  speed: z.number().min(0.7).max(1.2).optional(),
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

  const parsed = NarrateSchema.safeParse(req.body || {});
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid tone selection." });
  }

  const book = await prisma.book.findFirst({
    where: { id: bookId, familyId: auth.familyId, type: "CUSTOM" },
    include: { pages: { orderBy: { pageNumber: "asc" } } },
  });
  if (!book) {
    return res.status(404).json({ error: "Book not found." });
  }
  if (book.pages.length === 0) {
    return res.status(400).json({ error: "This book has no pages yet." });
  }

  // Locked in the FIRST time this book is narrated, then always reused
  // — see the schema field's own comment for why: re-narrating after
  // adding pages must never give the new pages a different voice than
  // the existing ones already have.
  let voiceId = book.narrationVoice;
  if (!voiceId) {
    const tone = parsed.data.tone || DEFAULT_NARRATION_TONE;
    voiceId = NARRATION_TONES[tone]!.voiceId;
    await prisma.book.update({ where: { id: book.id }, data: { narrationVoice: voiceId } });
  }

  const job = await prisma.generationJob.create({
    data: {
      familyId: auth.familyId,
      bookId: book.id,
      jobType: "NARRATION",
      status: "PROCESSING",
      startedAt: new Date(),
    },
  });

  try {
    const results: { pageId: string; ok: boolean; error?: string }[] = [];
    // Sequential, matching the same rate-limit caution used for image
    // generation — OpenAI's TTS endpoint hasn't been load-tested by
    // this app the way images have, so starting cautious rather than
    // assuming it tolerates concurrent requests better.
    for (const page of book.pages) {
      if (page.narrationAssetId) {
        results.push({ pageId: page.id, ok: true }); // already narrated — skip, don't regenerate
        continue;
      }
      if (!page.text) {
        results.push({ pageId: page.id, ok: false, error: "Page has no text." });
        continue;
      }
      try {
        await narratePage({
          pageId: page.id,
          pageText: page.text,
          voiceId,
          speed: parsed.data.speed,
          familyId: auth.familyId,
          userId: auth.userId,
          bookId: book.id,
        });
        results.push({ pageId: page.id, ok: true });
      } catch (pageErr) {
        console.error(`Narration failed for page ${page.id}:`, pageErr);
        results.push({ pageId: page.id, ok: false, error: (pageErr as Error).message });
      }
      // Written after EVERY page, success or failure — this is what
      // makes real, live progress possible at all. The main request
      // below still blocks until the whole loop finishes (Vercel
      // functions can't run work in the background after responding),
      // but this same GenerationJob row is readable by a SEPARATE,
      // concurrent request the whole time this one is still running —
      // that's what /api/generation-jobs/[id] polls, and it's how the
      // progress modal shows real advancement instead of a static
      // spinner someone could easily mistake for the feature being
      // broken.
      await prisma.generationJob.update({
        where: { id: job.id },
        data: { resultJson: { completed: results.length, total: book.pages.length, results } },
      });
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
    console.error("narrate error:", err);
    await prisma.generationJob.update({
      where: { id: job.id },
      data: { status: "FAILED", completedAt: new Date(), errorMessage: (err as Error).message },
    });
    return res.status(500).json({ error: (err as Error).message || "Unexpected server error." });
  }
}

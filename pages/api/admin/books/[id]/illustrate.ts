// POST /api/admin/books/[id]/illustrate
//
// The admin-side counterpart to /api/books/[bookId]/illustrate — same
// underlying mechanism (a generic character bible instead of a
// child-derived one, the same per-page pose selection and consistency
// approach, the same manual-not-automatic trigger since it costs real
// money), reached by an admin illustrating shared library content
// instead of a parent illustrating their own family's book.
export const config = {
  maxDuration: 280,
};

import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/authAdmin";
import {
  getOrCreateGenericBookCharacterBible,
  getOrGenerateCharacterReferenceBase64,
  generateBookCover,
  illustratePage,
} from "@/lib/illustration";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const auth = await requireAdmin(req);
  if (!auth.ok) {
    return res.status(auth.status).json({ error: auth.error });
  }

  const { id } = req.query;
  if (typeof id !== "string") {
    return res.status(400).json({ error: "Invalid book id." });
  }

  const book = await prisma.book.findFirst({
    where: { id, type: "CURATED" },
    include: { pages: { orderBy: { pageNumber: "asc" } } },
  });
  if (!book) {
    return res.status(404).json({ error: "Book not found." });
  }
  if (book.pages.length === 0) {
    return res.status(400).json({ error: "This book has no pages yet." });
  }

  // No GenerationJob for admin illustration — GenerationJob.familyId is
  // required (unlike AIUsageRecord, which was just made nullable for
  // exactly this admin case), and an admin operation genuinely has no
  // family to attribute one to. Making up a value (e.g. picking any
  // family's id) would write actively misleading data, worse than not
  // tracking at all — this route's own response (the results array
  // below) is the only record of what happened for now, same asymmetry
  // as everywhere else admin content differs from family content in
  // this codebase.

  try {
    const characterBible = await getOrCreateGenericBookCharacterBible(book.id, book.title, book.category);
    await getOrGenerateCharacterReferenceBase64(characterBible, null, "neutral");
    await generateBookCover({
      bookId: book.id,
      title: book.title,
      characterBible,
      familyId: null,
      userId: auth.userId,
    });

    const results: { pageId: string; ok: boolean; error?: string }[] = [];
    for (const page of book.pages) {
      if (page.illustrationAssetId) {
        results.push({ pageId: page.id, ok: true });
        continue;
      }
      if (!page.text) {
        results.push({ pageId: page.id, ok: false, error: "Page has no text." });
        continue;
      }
      try {
        await illustratePage({
          pageId: page.id,
          pageText: page.text,
          characterBible,
          familyId: null,
          userId: auth.userId,
          bookId: book.id,
        });
        results.push({ pageId: page.id, ok: true });
      } catch (pageErr) {
        console.error(`Admin illustration failed for page ${page.id}:`, pageErr);
        results.push({ pageId: page.id, ok: false, error: (pageErr as Error).message });
      }
    }

    return res.status(200).json({ results, failedCount: results.filter((r) => !r.ok).length });
  } catch (err) {
    console.error("admin illustrate error:", err);
    return res.status(500).json({ error: (err as Error).message || "Unexpected server error." });
  }
}

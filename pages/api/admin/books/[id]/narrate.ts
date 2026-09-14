// POST /api/admin/books/[id]/narrate
// Admin-side counterpart to /api/books/[bookId]/narrate — same reasons
// for being manual, not automatic (real per-page cost). No family to
// attribute AIUsageRecord to here either, same as admin illustration —
// narratePage already accepts a nullable-in-spirit approach via its
// own familyId param; passed as null here.
export const config = {
  maxDuration: 280,
};

import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/authAdmin";
import { narratePage } from "@/lib/narration";

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

  try {
    const results: { pageId: string; ok: boolean; error?: string }[] = [];
    for (const page of book.pages) {
      if (page.narrationAssetId) {
        results.push({ pageId: page.id, ok: true });
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
          familyId: null,
          userId: auth.userId,
          bookId: book.id,
        });
        results.push({ pageId: page.id, ok: true });
      } catch (pageErr) {
        console.error(`Admin narration failed for page ${page.id}:`, pageErr);
        results.push({ pageId: page.id, ok: false, error: (pageErr as Error).message });
      }
    }

    return res.status(200).json({ results, failedCount: results.filter((r) => !r.ok).length });
  } catch (err) {
    console.error("admin narrate error:", err);
    return res.status(500).json({ error: (err as Error).message || "Unexpected server error." });
  }
}

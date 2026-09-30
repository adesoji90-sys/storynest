// POST /api/admin/books/[id]/illustrate
//
// RESTRUCTURED the same way as the family-scoped illustrate route (see
// that file's own comment for the full reasoning) — this no longer
// illustrates every page itself in one long-blocking request, which is
// exactly what a longer curated book with several pages could time out
// on even at a generous maxDuration. Now it just validates the book and
// hands back which page ids still need illustrating; the real work
// happens in illustrate-page.ts, called once per page by the admin
// panel's own client-side loop.
export const config = {
  maxDuration: 60,
};

import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/authAdmin";
import { getOrCreateGenericBookCharacterBible, getOrGenerateCharacterReferenceBase64 } from "@/lib/illustration";
import { isAncillaryPage } from "@/lib/ancillaryPages";

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
    const characterBible = await getOrCreateGenericBookCharacterBible(book.id, book.title, book.category);
    await getOrGenerateCharacterReferenceBase64(characterBible, null, "neutral");

    // No GenerationJob here — same documented reason as before
    // (familyId is required on that table and an admin operation has
    // none). Progress across calls is tracked by the database itself:
    // a page already carrying illustrationAssetId is simply skipped, so
    // there's nothing separate to persist just to know what's left.
    const pendingPages = book.pages.filter((p: any) => !isAncillaryPage(p.text || "") && p.text && !p.illustrationAssetId);

    return res.status(200).json({ pageIds: pendingPages.map((p: any) => p.id) });
  } catch (err) {
    console.error("admin illustrate setup error:", err);
    return res.status(500).json({ error: (err as Error).message || "Unexpected server error." });
  }
}

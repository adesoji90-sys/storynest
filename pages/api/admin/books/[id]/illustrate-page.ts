// POST /api/admin/books/[id]/illustrate-page
//
// The admin-side counterpart to /api/books/[bookId]/illustrate-page —
// same split for the same reason (one short request per page instead
// of one long request for the whole book). Body: { pageId }. No jobId
// here since admin illustration has no GenerationJob to update (see
// illustrate.ts's own comment) — progress across calls is just the
// database's own illustrationAssetId state.
export const config = {
  maxDuration: 90,
};

import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/authAdmin";
import { getOrCreateGenericBookCharacterBible, getOrGenerateCharacterReferenceBase64, generateBookCover, illustratePage } from "@/lib/illustration";
import { isAncillaryPage } from "@/lib/ancillaryPages";

const BodySchema = z.object({ pageId: z.string().uuid() });

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
  const parsed = BodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "pageId is required." });
  }

  const book = await prisma.book.findFirst({
    where: { id, type: "CURATED" },
    include: { pages: { orderBy: { pageNumber: "asc" } } },
  });
  if (!book) {
    return res.status(404).json({ error: "Book not found." });
  }
  const page = book.pages.find((p: any) => p.id === parsed.data.pageId);
  if (!page || !page.text) {
    return res.status(404).json({ error: "Page not found on this book." });
  }

  try {
    // Re-derived here, cheap and idempotent — same reasoning as the
    // family-scoped illustrate-page's matching comment.
    const characterBible = await getOrCreateGenericBookCharacterBible(book.id, book.title, book.category);

    await illustratePage({
      pageId: page.id,
      pageText: page.text,
      characterBible,
      familyId: null,
      userId: auth.userId,
      bookId: book.id,
    });

    // Cover generated once every remaining illustrable page has a real
    // illustrationAssetId — checked fresh from the database rather than
    // trusting a client-supplied count, since this endpoint has no
    // jobId to track expected totals the way the family-scoped version
    // does. Queried AFTER illustratePage above has already set this
    // page's own illustrationAssetId, so it correctly no longer counts
    // as pending in this check.
    const allPages = await prisma.page.findMany({ where: { bookId: book.id }, select: { text: true, illustrationAssetId: true } });
    const stillPending = allPages.some((p: any) => !isAncillaryPage(p.text || "") && p.text && !p.illustrationAssetId);
    if (!stillPending) {
      const referenceBase64 = await getOrGenerateCharacterReferenceBase64(characterBible, null, "neutral");
      await generateBookCover({
        bookId: book.id,
        title: book.title,
        characterBible,
        referenceBase64,
        familyId: null,
        userId: auth.userId,
      });
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error(`admin illustrate-page error (page ${page.id}):`, err);
    return res.status(500).json({ error: (err as Error).message || "Couldn't illustrate this page." });
  }
}

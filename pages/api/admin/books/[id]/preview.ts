// GET /api/admin/books/[id]/preview
//
// A genuinely different endpoint from /api/read/[bookId], not a
// variant of it — that route requires a childId with an ACTIVE
// assignment (see its own top comment), which is exactly right for a
// family reading their own assigned book but makes no sense for an
// admin checking a book's content. This has no childId, no assignment
// check, no progress tracking — it's read-only content access for
// admin review, gated by requireAdmin instead of requireFamily.
import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/authAdmin";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.SUPABASE_SERVICE_ROLE_KEY as string
);
const SIGNED_URL_TTL_SECONDS = 60 * 60; // an hour is plenty for someone reviewing a book once, not something that needs to stay valid across a return visit the way a family's reading session might

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
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

  const book = await prisma.book.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      authorName: true,
      coverAsset: { select: { bucket: true, storageKey: true } },
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

  const coverUrl = book.coverAsset
    ? supabaseAdmin.storage.from(book.coverAsset.bucket).getPublicUrl(book.coverAsset.storageKey).data.publicUrl
    : null;

  const pagesWithUrls = await Promise.all(
    book.pages.map(async (page: any) => {
      const illustrationUrl = page.illustrationAsset
        ? (await supabaseAdmin.storage.from(page.illustrationAsset.bucket).createSignedUrl(page.illustrationAsset.storageKey, SIGNED_URL_TTL_SECONDS)).data?.signedUrl || null
        : null;
      return { id: page.id, pageNumber: page.pageNumber, text: page.text, illustrationUrl };
    })
  );

  return res.status(200).json({
    book: { id: book.id, title: book.title, authorName: book.authorName, coverUrl, pages: pagesWithUrls },
  });
}

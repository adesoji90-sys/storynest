// POST /api/admin/books/[id]/generate-pdf
// Builds and stores the "fully ready to print" PDF for a curated book
// — cover, every illustrated page, real text. Requires the book to
// already be illustrated (fetches each page's real illustration via a
// signed URL the same way the reader does); narration doesn't factor
// into a print PDF at all, so this doesn't depend on that step.
export const config = {
  maxDuration: 280,
};

import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/authAdmin";
import { buildBookPdfBuffer } from "@/lib/bookPdf";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.SUPABASE_SERVICE_ROLE_KEY as string
);

const SIGNED_URL_TTL_SECONDS = 300; // short-lived — only needed long enough to fetch each image during PDF assembly, not for any end-user access

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
    include: {
      coverAsset: { select: { bucket: true, storageKey: true } },
      pages: { orderBy: { pageNumber: "asc" }, include: { illustrationAsset: { select: { bucket: true, storageKey: true } } } },
    },
  });
  if (!book) {
    return res.status(404).json({ error: "Book not found." });
  }
  const unillustrated = book.pages.filter((p: any) => !p.illustrationAsset);
  if (unillustrated.length > 0) {
    return res.status(400).json({ error: `${unillustrated.length} page(s) aren't illustrated yet — illustrate the book first.` });
  }

  try {
    const coverUrl = book.coverAsset
      ? supabaseAdmin.storage.from(book.coverAsset.bucket).getPublicUrl(book.coverAsset.storageKey).data.publicUrl
      : null;

    const pagesWithUrls = await Promise.all(
      book.pages.map(async (page: any) => {
        const { data } = await supabaseAdmin.storage
          .from(page.illustrationAsset.bucket)
          .createSignedUrl(page.illustrationAsset.storageKey, SIGNED_URL_TTL_SECONDS);
        return { text: page.text, illustrationUrl: data?.signedUrl || null };
      })
    );

    const pdfBytes = await buildBookPdfBuffer({
      title: book.title,
      authorName: book.authorName,
      coverUrl,
      pages: pagesWithUrls,
    });

    const storageKey = `${book.id}.pdf`;
    const { error: uploadError } = await supabaseAdmin.storage
      .from("book-pdfs")
      .upload(storageKey, Buffer.from(pdfBytes), { contentType: "application/pdf", upsert: true });
    if (uploadError) {
      throw new Error("Couldn't save the generated PDF.");
    }

    const asset = await prisma.asset.create({
      data: { kind: "PDF", bucket: "book-pdfs", storageKey, mimeType: "application/pdf" },
    });
    await prisma.book.update({ where: { id: book.id }, data: { pdfAssetId: asset.id } });

    const pdfUrl = supabaseAdmin.storage.from("book-pdfs").getPublicUrl(storageKey).data.publicUrl;
    return res.status(200).json({ pdfUrl });
  } catch (err) {
    console.error("generate-pdf error:", err);
    return res.status(500).json({ error: (err as Error).message || "Unexpected server error." });
  }
}

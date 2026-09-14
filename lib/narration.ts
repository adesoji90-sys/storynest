// Narration logic, kept separate from lib/illustration.ts — a genuinely
// different concern (audio vs. images), even though the shape (one
// function per page, called in a loop by the triggering route) mirrors
// illustratePage deliberately for consistency.

import { createClient } from "@supabase/supabase-js";
import { prisma } from "@/lib/prisma";
import { getNarrationProvider } from "@/lib/ai/NarrationProvider";
import { estimateNarrationCostKobo } from "@/lib/ai/costEstimate";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.SUPABASE_SERVICE_ROLE_KEY as string
);

// Generates and saves narration for exactly one page — callers loop
// over a book's pages and call this once per page (see
// /api/books/[bookId]/narrate), never touching another page's existing
// narration, same independent-regeneration principle Section 6
// requires for illustrations, applied here too.
export async function narratePage(params: {
  pageId: string;
  pageText: string;
  familyId: string | null;
  userId: string;
  bookId: string;
}) {
  const provider = getNarrationProvider();
  const result = await provider.generateNarration({ text: params.pageText });

  const storageKey = `${params.bookId}_page_${params.pageId}.mp3`;
  const { error: uploadError } = await supabaseAdmin.storage
    .from("book-narrations")
    .upload(storageKey, Buffer.from(result.base64, "base64"), { contentType: result.mimeType, upsert: true });
  if (uploadError) {
    throw new Error("Couldn't save the generated narration.");
  }

  const asset = await prisma.asset.create({
    data: {
      kind: "AUDIO",
      bucket: "book-narrations",
      storageKey,
      mimeType: result.mimeType,
      durationMs: result.durationMs,
    },
  });
  await prisma.page.update({
    where: { id: params.pageId },
    data: { narrationAssetId: asset.id },
  });

  await prisma.aIUsageRecord.create({
    data: {
      familyId: params.familyId,
      userId: params.userId,
      bookId: params.bookId,
      pageId: params.pageId,
      operationType: "NARRATION",
      provider: "openai",
      model: result.model,
      estimatedCostMinorUnits: estimateNarrationCostKobo(params.pageText.length),
      currency: "NGN",
      status: "success",
    },
  });

  return asset;
}

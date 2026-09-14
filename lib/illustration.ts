// Core illustration logic shared by whatever routes trigger it. Every
// Story Studio book's protagonist is the child it was written for, so
// rather than requiring a separate "describe your child's appearance"
// form before any illustration can happen (real, additional UI scope
// this pass deliberately doesn't build), a minimal CharacterBible is
// auto-created per child on first use and reused after that — one
// bible per child, not per book, so the same child looks the same
// across every book they're assigned (Section 11's actual requirement).
//
// The appearance description is deliberately generic where we have no
// real information (no ethnicity, no specific hair/skin details
// invented) — inventing false specific physical traits for a real
// child would be presumptuous in a way an intentionally generic
// description isn't. The story text itself already carries Section
// 22's African-first framing; the image prompt leans on that rather
// than fabricating details this app was never told.

import { createClient } from "@supabase/supabase-js";
import { prisma } from "@/lib/prisma";
import { getImageProvider } from "@/lib/ai/ImageProvider";
import { estimateImageGenerationCostKobo } from "@/lib/ai/costEstimate";
import { getStyle } from "@/lib/ai/imageStyles";
import { getPose, selectPose } from "@/lib/ai/characterPoses";
import { IMAGE_QUALITY } from "@/lib/imageConfig";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.SUPABASE_SERVICE_ROLE_KEY as string
);

interface UsageLogParams {
  familyId: string;
  userId: string | null;
  bookId: string | null;
  pageId: string | null;
}

async function logImageUsage(params: UsageLogParams) {
  await prisma.aIUsageRecord.create({
    data: {
      familyId: params.familyId,
      userId: params.userId,
      bookId: params.bookId,
      pageId: params.pageId,
      operationType: "IMAGE_GENERATION",
      provider: "openai",
      model: "gpt-image-1.5",
      estimatedCostMinorUnits: estimateImageGenerationCostKobo(IMAGE_QUALITY),
      currency: "NGN",
      status: "success",
    },
  });
}

export async function getOrCreateChildCharacterBible(childId: string, familyId: string) {
  const existing = await prisma.characterBible.findFirst({ where: { childId } });
  if (existing) return existing;

  const child = await prisma.child.findUniqueOrThrow({ where: { id: childId } });
  const age = child.dateOfBirth
    ? Math.floor((Date.now() - new Date(child.dateOfBirth).getTime()) / (365.25 * 24 * 60 * 60 * 1000))
    : null;

  return prisma.characterBible.create({
    data: {
      childId,
      familyId,
      name: child.name,
      age,
      appearance: "A cheerful, friendly child with a warm smile.",
      visualStyle: "painterly",
    },
  });
}

// Returns base64 bytes ready to pass as a reference to the image
// provider — generating once per (character, pose) and caching (via
// CharacterReferenceAsset) on first call, downloading the cached file
// directly on every call after that. Pose variety (rather than always
// reusing one static "neutral" reference) is a real improvement over
// the first-pass version of this function: a character shown the same
// static way on every page reads as flat and repetitive across a whole
// book, while poses matched to each page's emotional beat (via
// selectPose in the caller) give genuinely richer illustrations for
// the same underlying character-consistency mechanism. The schema
// already supported multiple poses per character from the start
// (CharacterReferenceAsset is unique on characterId+poseId, not
// characterId alone) — this was always the intended shape, just not
// used yet.
export async function getOrGenerateCharacterReferenceBase64(
  characterBible: { id: string; name: string; age: number | null; appearance: string | null; visualStyle: string },
  familyId: string,
  poseId: string = "neutral"
): Promise<string> {
  const existing = await prisma.characterReferenceAsset.findUnique({
    where: { characterId_poseId: { characterId: characterBible.id, poseId } },
    include: { asset: true },
  });

  if (existing) {
    const { data, error } = await supabaseAdmin.storage
      .from(existing.asset.bucket)
      .download(existing.asset.storageKey);
    if (error || !data) {
      throw new Error("Couldn't retrieve the cached character reference.");
    }
    const buffer = Buffer.from(await data.arrayBuffer());
    return buffer.toString("base64");
  }

  const pose = getPose(poseId);
  const style = getStyle(characterBible.visualStyle);
  const prompt = `A ${style.guide} of a
${characterBible.age ? `${characterBible.age}-year-old` : "young"} child named ${characterBible.name}.
${characterBible.appearance || "A cheerful, friendly child."}
Now show them ${pose.prompt}
Warm African-first children's book illustration context.`;

  const provider = getImageProvider();
  const result = await provider.generateImage({ prompt, width: 1024, height: 1536 });

  const storageKey = `${characterBible.id}_${pose.id}.png`;
  const { error: uploadError } = await supabaseAdmin.storage
    .from("character-references")
    .upload(storageKey, Buffer.from(result.base64, "base64"), { contentType: "image/png", upsert: true });
  if (uploadError) {
    throw new Error("Couldn't save the generated character reference.");
  }

  const asset = await prisma.asset.create({
    data: { kind: "CHARACTER_REFERENCE", bucket: "character-references", storageKey, mimeType: "image/png" },
  });
  await prisma.characterReferenceAsset.create({
    data: { characterId: characterBible.id, poseId: pose.id, assetId: asset.id },
  });
  await logImageUsage({ familyId, userId: null, bookId: null, pageId: null });

  return result.base64;
}

// Generates and saves the illustration for exactly one page — callers
// loop over a book's pages and call this once per page (see
// /api/books/[bookId]/illustrate), never touching another page's
// existing illustration, matching Section 6's independent-regeneration
// requirement. Selects a pose per page (via selectPose, keyed off that
// page's own text) rather than reusing one fixed reference for every
// page in the book — the character-reference cache means a pose used
// on page 3 is instant on page 9 if another page calls for the same
// emotional beat, so this doesn't multiply generation cost per page,
// just varies it meaningfully across a book's pages.
export async function illustratePage(params: {
  pageId: string;
  pageText: string;
  characterBible: { id: string; name: string; age: number | null; appearance: string | null; visualStyle: string };
  familyId: string;
  userId: string;
  bookId: string;
}) {
  const poseId = selectPose(params.pageText);
  const referenceBase64 = await getOrGenerateCharacterReferenceBase64(params.characterBible, params.familyId, poseId);
  const style = getStyle(params.characterBible.visualStyle);

  const provider = getImageProvider();
  const result = await provider.generateImage({
    prompt: `${params.pageText}\n\nIllustrate this scene as a ${style.guide}.`,
    references: [{ label: `a reference image of ${params.characterBible.name}`, base64: referenceBase64 }],
    width: 1024,
    height: 1024,
  });

  const storageKey = `${params.bookId}_page_${params.pageId}.png`;
  const { error: uploadError } = await supabaseAdmin.storage
    .from("book-illustrations")
    .upload(storageKey, Buffer.from(result.base64, "base64"), { contentType: "image/png", upsert: true });
  if (uploadError) {
    throw new Error("Couldn't save the generated illustration.");
  }

  const asset = await prisma.asset.create({
    data: { kind: "ILLUSTRATION", bucket: "book-illustrations", storageKey, mimeType: "image/png" },
  });
  await prisma.page.update({
    where: { id: params.pageId },
    data: { illustrationAssetId: asset.id, status: "ILLUSTRATED" },
  });
  await logImageUsage({ familyId: params.familyId, userId: params.userId, bookId: params.bookId, pageId: params.pageId });

  return asset;
}

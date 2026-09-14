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
import { IMAGE_MODEL, IMAGE_QUALITY } from "@/lib/imageConfig";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.SUPABASE_SERVICE_ROLE_KEY as string
);

interface UsageLogParams {
  familyId: string | null;
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
      // Was hardcoded to "gpt-image-1.5" — a real, separate bug found
      // while making this change: the actual configured model was
      // upgraded to gpt-image-2 in an earlier round, but this literal
      // string was never updated to match, so every usage record since
      // then has logged the wrong model name. Reading it from the same
      // config the provider itself uses means this can't drift out of
      // sync again the same way.
      model: IMAGE_MODEL,
      estimatedCostMinorUnits: estimateImageGenerationCostKobo(IMAGE_QUALITY),
      currency: "NGN",
      status: "success",
    },
  });
}

// themeContext (the story's own brief.theme) is used ONLY the first
// time a character is created for this child — it's what makes the
// "neutral" reference (which every page illustration is generated
// FROM, via edits) actually describe the same subject the cover
// generator already sees via the book's title. Without this, the two
// were built from disconnected descriptions: the cover incorporated
// the title/theme, the character reference used a hardcoded generic
// "cheerful child" with no idea what the story was actually about —
// which is exactly why a story about, say, a pregnant woman could show
// pregnancy on the cover but nowhere in the actual pages.
//
// HONEST REMAINING LIMITATION: a CharacterBible is still cached per
// CHILD, not per STORY — reused across every future book for that
// child. This fixes the mismatch WITHIN one book; it doesn't yet
// handle a second, later story for the same child describing a
// completely different subject (that story would still see this
// FIRST story's cached appearance). Fixing that properly means
// character bibles keyed per-story instead of per-child-forever, a
// real, separate change, not something folded into this fix. A parent
// can work around it today via "Customize their character's
// appearance" in Story Studio, which overwrites this description
// explicitly.
export async function getOrCreateChildCharacterBible(childId: string, familyId: string, themeContext?: string) {
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
      appearance: themeContext
        ? `The main character in a story about: ${themeContext}`
        : "A cheerful, friendly child with a warm smile.",
      visualStyle: "painterly",
    },
  });
}

// Curated (admin-authored) books have no child and no family to derive
// a character from — cached per BOOK instead, via the BookCharacter
// join table (checking that, not CharacterBible.childId, since a
// generic character's childId is null and would otherwise match every
// other generic character across every curated book, not just this
// one). "Tobi" is a placeholder name, not meant to match whatever name
// the book's own text happens to use for its character — it only needs
// to keep the image prompt's "a child named X" phrasing natural and
// consistent across a book's pages, not to be narratively accurate.
// Giving admins their own way to name/describe this character is a
// real, natural improvement for later, not built in this pass.
export async function getOrCreateGenericBookCharacterBible(bookId: string, bookTitle: string, category: string | null) {
  const existingLink = await prisma.bookCharacter.findFirst({ where: { bookId }, include: { character: true } });
  if (existingLink) return existingLink.character;

  const character = await prisma.characterBible.create({
    data: {
      childId: null,
      familyId: null,
      name: "Tobi",
      appearance: `A warm, cheerful child character suited to a story called "${bookTitle}"${category ? `, in the ${category} category` : ""}.`,
      visualStyle: "painterly",
    },
  });
  await prisma.bookCharacter.create({ data: { bookId, characterId: character.id, role: "main" } });
  return character;
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
  familyId: string | null,
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

  // The actual fix for cross-pose clothing/appearance drift: earlier,
  // every pose was generated as an independent from-scratch call,
  // meaning each pose was the model's own fresh re-interpretation of
  // the same TEXT description — the same words don't guarantee the
  // same pixels twice, which is exactly the inconsistency this was
  // producing. Now, if a "neutral" base reference already exists for
  // this character, later poses are generated as EDITS of that actual
  // image (the model can see the real reference, not just a
  // description of it) rather than fresh generations — the same
  // "placement, not redesign" mechanism OpenAIImageProvider already
  // uses for scene illustration, applied here to pose generation too.
  // The very first pose generated for a character has no base to edit
  // from yet, so it's still a from-scratch generation — everything
  // after that anchors back to it.
  const baseReference =
    poseId !== "neutral"
      ? await prisma.characterReferenceAsset.findUnique({
          where: { characterId_poseId: { characterId: characterBible.id, poseId: "neutral" } },
          include: { asset: true },
        })
      : null;

  const provider = getImageProvider();
  let result;

  if (baseReference) {
    const { data, error } = await supabaseAdmin.storage
      .from(baseReference.asset.bucket)
      .download(baseReference.asset.storageKey);
    if (error || !data) {
      throw new Error("Couldn't retrieve the base character reference.");
    }
    const baseBase64 = Buffer.from(await data.arrayBuffer()).toString("base64");
    result = await provider.generateImage({
      prompt: `Show this exact same character now ${pose.prompt}\nMatch their face, hairstyle, outfit, and outfit colors exactly as shown in the reference — do not redesign or reinterpret their appearance in any way, only change their pose and expression.`,
      references: [{ label: characterBible.name, base64: baseBase64 }],
      width: 1024,
      height: 1536,
    });
  } else {
    const prompt = `A ${style.guide} of a
${characterBible.age ? `${characterBible.age}-year-old` : "young"} child named ${characterBible.name}.
${characterBible.appearance || "A cheerful, friendly child."}
Now show them ${pose.prompt}
Warm African-first children's book illustration context.`;
    result = await provider.generateImage({ prompt, width: 1024, height: 1536 });
  }

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

// Generates a book's cover ART (once, cached via Book.coverAssetId) —
// deliberately text-free. The actual title and author are rendered as
// real HTML/CSS text over this image wherever a cover is shown, not
// baked into the generated pixels — AI image models still make real
// mistakes rendering embedded text (misspellings, garbled letters,
// inconsistent fonts), which is a bad tradeoff for the one piece of
// text on a cover that absolutely has to be readable and correct.
// Separating "art" from "typography" is also how virtually every real
// book-cover or print-on-demand tool works, not a shortcut particular
// to this app.
export async function generateBookCover(params: {
  bookId: string;
  title: string;
  characterBible: { name: string; appearance: string | null; visualStyle: string } | null;
  familyId: string | null; // null for a curated/admin book — AIUsageRecord.familyId is nullable now specifically to make this legitimate, not a gap being worked around
  userId: string | null;
}) {
  const book = await prisma.book.findUnique({ where: { id: params.bookId }, select: { coverAssetId: true } });
  if (book?.coverAssetId) return; // already has one — never regenerate silently

  const style = getStyle(params.characterBible?.visualStyle || "painterly");
  const prompt = `A children's book cover ILLUSTRATION for a story called "${params.title}".
${params.characterBible ? `Featuring the main character, ${params.characterBible.name}: ${params.characterBible.appearance || "a cheerful, friendly child"}.` : "An inviting, evocative scene capturing the spirit of the story."}
${style.guide}
IMPORTANT: absolutely no text, letters, words, or writing anywhere in the image — this is artwork only, title text is added separately afterward. Leave open, relatively uncluttered space in the upper third of the composition where a title will be placed on top later.`;

  const provider = getImageProvider();
  const result = await provider.generateImage({ prompt, width: 1024, height: 1536 });

  const storageKey = `${params.bookId}_cover.png`;
  const { error: uploadError } = await supabaseAdmin.storage
    .from("book-covers")
    .upload(storageKey, Buffer.from(result.base64, "base64"), { contentType: "image/png", upsert: true });
  if (uploadError) {
    throw new Error("Couldn't save the generated cover.");
  }

  const asset = await prisma.asset.create({
    data: { kind: "COVER", bucket: "book-covers", storageKey, mimeType: "image/png" },
  });
  await prisma.book.update({ where: { id: params.bookId }, data: { coverAssetId: asset.id } });
  await logImageUsage({ familyId: params.familyId, userId: params.userId, bookId: params.bookId, pageId: null });

  return asset;
}
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
  familyId: string | null;
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

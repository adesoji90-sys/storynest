// POST /api/story-studio/[storyId]/generate
//
// Generates a new StoryVersion for an existing Story — personalized to
// the specific child it was started for (name, age, reading level,
// interests all feed the prompt), unlike admin content's generic
// library-book prompt. Callable more than once: each call creates a
// NEW version rather than overwriting the last one (Section 10's
// explicit "never destructively overwrite... use versioning"
// requirement) — this is what lets a parent regenerate if they don't
// like the first draft without losing it from history.
//
// Still text-only, same reasoning as admin content generation:
// illustration is separate, later, expensive work that only happens
// after a story is approved (Section 14).

import type { NextApiRequest, NextApiResponse } from "next";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireFamily } from "@/lib/authFamily";
import { getStoryProvider } from "@/lib/ai/StoryProvider";
import { estimateStoryGenerationCostKobo } from "@/lib/ai/costEstimate";

function buildSystemPrompt(targetPages: number, child: { name: string; age: number | null; readingLevel: string | null; interests: string[] }) {
  const wordTarget = targetPages * 80;
  return `You are a children's story writer creating a PERSONALIZED story
for one specific child, ${child.name}${child.age ? `, age ${child.age}` : ""}.
${child.readingLevel ? `Their reading level is ${child.readingLevel}.` : ""}
${child.interests.length ? `They're interested in: ${child.interests.join(", ")}.` : ""}
Write ${child.name} into the story as the main character. Make it roughly
${wordTarget} words, split into approximately ${targetPages} pages.

Respond with ONLY valid JSON, no markdown fences, no preamble, in exactly
this shape:
{
  "title": "string",
  "pages": [
    { "text": "2-4 sentence paragraph for this page" }
  ]
}

The number of items in "pages" should be close to ${targetPages} — a page
or two more or fewer is fine. Reflect an African-first perspective
naturally (Nigerian/African names, families, environments, settings)
without stereotyping. Avoid anything frightening, violent, or otherwise
inappropriate for the child's age. If a lesson is specified in the brief,
let the story's ending embody it naturally rather than stating it as a
moral.`;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { storyId } = req.query;
  if (typeof storyId !== "string") {
    return res.status(400).json({ error: "Invalid story id." });
  }

  const auth = await requireFamily(req);
  if (!auth.ok) {
    return res.status(auth.status).json({ error: auth.error });
  }

  const story = await prisma.story.findFirst({
    where: { id: storyId, familyId: auth.familyId },
    include: { child: true },
  });
  if (!story) {
    return res.status(404).json({ error: "Story not found." });
  }

  const brief = story.brief as {
    theme: string;
    lesson?: string;
    genre?: string;
    setting?: string;
    pageCount: number;
    parentInstructions?: string;
  };

  const child = story.child;
  if (!child) {
    // Story.childId is nullable in the schema because admin-authored
    // curated books use the same Story model without one — but every
    // story created through THIS route (/api/story-studio) always sets
    // a childId. Reaching this branch means a story somehow lost its
    // child link after creation, not a normal case, so it's reported
    // as a real error rather than silently generating an
    // un-personalized story.
    return res.status(500).json({ error: "This story has no child linked to it — cannot personalize." });
  }
  const age = child.dateOfBirth
    ? Math.floor((Date.now() - new Date(child.dateOfBirth).getTime()) / (365.25 * 24 * 60 * 60 * 1000))
    : null;

  const userPrompt = `
Theme / brief: ${brief.theme}
Genre: ${brief.genre || "not specified"}
Setting: ${brief.setting || "not specified"}
Lesson to embody: ${brief.lesson || "not specified"}
Parent's additional instructions: ${brief.parentInstructions || "none"}
Target page count: ${brief.pageCount}

Write the full story now as JSON, following the system instructions exactly.
`.trim();

  try {
    const provider = getStoryProvider();
    let result;
    try {
      result = await provider.generateStory({
        systemPrompt: buildSystemPrompt(brief.pageCount, {
          name: child.name,
          age,
          readingLevel: child.readingLevel,
          interests: child.interests,
        }),
        userPrompt,
        maxTokens: Math.min(8000, 1800 + brief.pageCount * 420),
      });
    } catch (providerErr) {
      return res.status(502).json({ error: (providerErr as Error).message || "Story generation failed upstream." });
    }

    // Logged here, right after a successful provider response and
    // before attempting to parse it — the cost was incurred the moment
    // Anthropic returned tokens, regardless of whether we can make
    // sense of the response afterward. Section 16 requires this for
    // every AI operation; Story Studio has a real familyId to attribute
    // it to (unlike admin content generation — see that route's
    // comment for why it can't do the same yet).
    await prisma.aIUsageRecord.create({
      data: {
        familyId: auth.familyId,
        userId: auth.userId,
        bookId: story.bookId,
        operationType: "STORY_GENERATION",
        provider: "anthropic",
        model: result.model,
        inputUnits: result.inputTokens,
        outputUnits: result.outputTokens,
        estimatedCostMinorUnits: estimateStoryGenerationCostKobo(result.inputTokens, result.outputTokens),
        currency: "NGN",
        status: "success",
      },
    });

    let generated: { title?: string; pages?: { text: string }[] };
    try {
      generated = JSON.parse(result.rawText);
    } catch {
      console.error("Failed to parse generated story JSON:", result.rawText.slice(0, 500));
      return res.status(502).json({ error: "Couldn't parse the generated story — try again." });
    }
    if (!generated.title || !Array.isArray(generated.pages) || generated.pages.length === 0) {
      return res.status(502).json({ error: "The generated story was missing a title or pages — try again." });
    }

    const latestVersion = await prisma.storyVersion.findFirst({
      where: { storyId },
      orderBy: { versionNumber: "desc" },
      select: { versionNumber: true },
    });
    const nextVersionNumber = (latestVersion?.versionNumber ?? 0) + 1;

    const version = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const created = await tx.storyVersion.create({
        data: {
          storyId,
          versionNumber: nextVersionNumber,
          title: generated.title as string,
          pagesJson: generated.pages as any,
        },
      });
      await tx.story.update({ where: { id: storyId }, data: { status: "STORY_GENERATED" } });
      return created;
    });

    return res.status(200).json({ versionNumber: version.versionNumber, title: version.title, pages: generated.pages });
  } catch (err) {
    console.error("story-studio generate error:", err);
    return res.status(500).json({ error: "Unexpected server error." });
  }
}

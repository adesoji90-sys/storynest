// POST /api/admin/books/generate
//
// Generates story TEXT ONLY from an admin-supplied brief — reuses the
// exact same Claude call pattern as generate-story.js (model, disabled
// thinking, token budget formula, truncation detection), adapted for
// curated library content rather than one family's personalized brief:
// no specific child/character is assumed, and the prompt leans into
// Section 22's African-first perspective for the shared library instead
// of one family's own details.
//
// This does NOT create anything in the database — it only returns
// { title, pages } for the admin to review and edit in the existing
// create-book form before submitting to POST /api/admin/books, the same
// "AI proposes, a person approves before anything is saved" principle
// Section 13 requires for parent-facing story editing, applied here to
// admin content instead.
//
// Still text-only — illustration generation remains a separate, later
// pass reusing Story Studio's image pipeline once that exists (see
// index.ts's comment on why that's not folded in here).

import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import { requireAdmin } from "@/lib/authAdmin";
import { getStoryProvider } from "@/lib/ai/StoryProvider";

const GenerateSchema = z.object({
  theme: z.string().trim().min(1, "Describe what the book should be about."),
  ageRangeMin: z.number().int().min(0).max(18).optional(),
  ageRangeMax: z.number().int().min(0).max(18).optional(),
  readingLevel: z.string().trim().max(40).optional(),
  lesson: z.string().trim().max(200).optional(),
  category: z.string().trim().max(60).optional(),
  language: z.string().trim().max(20).optional(),
  pageCount: z.number().int().min(3).max(30).default(10),
});

function buildSystemPrompt(targetPages: number) {
  const wordTarget = targetPages * 80;
  return `You are a children's story writer AND cataloguer for StoryNest's
curated library — books read by many different families' children, not
personalized to any one child. Write a warm, age-appropriate story of
roughly ${wordTarget} words, split into approximately ${targetPages} pages,
and classify it for the library catalogue at the same time.

Respond with ONLY valid JSON, no markdown fences, no preamble, in exactly
this shape:
{
  "title": "string",
  "ageRangeMin": number,
  "ageRangeMax": number,
  "readingLevel": "one of: Beginner, Early reader, Independent, Fluent",
  "category": "a short genre/category label, e.g. Bedtime, Adventure, Friendship, Family, Culture",
  "lesson": "the story's core lesson or theme in a few words, e.g. Sharing, Courage, Kindness",
  "pages": [
    { "text": "2-4 sentence paragraph for this page" }
  ]
}

The number of items in "pages" should be close to ${targetPages} — a page
or two more or fewer is fine. Invent original, appealing characters and
setting suited to the brief below; nothing needs to be requested by name.
Reflect an African-first perspective naturally (Nigerian/African names,
families, environments, settings) without restricting the story to only
African settings and without stereotyping, per the library's stated
editorial direction. Avoid anything frightening, violent, or otherwise
inappropriate for the stated age range. If a lesson is specified in the
brief, let the story's ending embody it naturally rather than stating it
as a moral, and use that same lesson (or a close paraphrase) in the
"lesson" field. Choose ageRangeMin/ageRangeMax/readingLevel/category
yourself based on the brief and the story you write, even if the brief
didn't specify them — every field in the response is required, not
optional, since these drive how the book is catalogued in the library.`;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const auth = await requireAdmin(req);
  if (!auth.ok) {
    return res.status(auth.status).json({ error: auth.error });
  }

  const parsed = GenerateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message || "Invalid input." });
  }
  const { theme, ageRangeMin, ageRangeMax, readingLevel, lesson, category, language, pageCount } = parsed.data;

  const userPrompt = `
Book theme / brief: ${theme}
Age range: ${ageRangeMin ?? "not specified"}–${ageRangeMax ?? "not specified"}
Reading level: ${readingLevel || "not specified"}
Category: ${category || "not specified"}
Lesson to embody: ${lesson || "not specified"}
Language: ${language || "English"}
Target page count: ${pageCount}

Write the full story now as JSON, following the system instructions exactly.
`.trim();

  try {
    const provider = getStoryProvider();
    let result;
    try {
      result = await provider.generateStory({
        systemPrompt: buildSystemPrompt(pageCount),
        userPrompt,
        maxTokens: Math.min(8000, 1800 + pageCount * 420),
      });
    } catch (providerErr) {
      return res.status(502).json({ error: (providerErr as Error).message || "Story generation failed upstream." });
    }

    // No AIUsageRecord here — Section 16's tracking is per-family
    // (AIUsageRecord.familyId is a required column), and admin-generated
    // curated content has no family to attribute cost to. Story Studio's
    // generate.ts (personalized, family-scoped) does create one. Fixing
    // this properly would mean making familyId nullable on
    // AIUsageRecord, a real schema change that doesn't belong folded
    // into this refactor — flagged here rather than silently skipped.

    let story: {
      title?: string;
      pages?: { text: string }[];
      ageRangeMin?: number;
      ageRangeMax?: number;
      readingLevel?: string;
      category?: string;
      lesson?: string;
    };
    try {
      story = JSON.parse(result.rawText);
    } catch {
      console.error("Failed to parse generated story JSON:", result.rawText.slice(0, 500));
      return res.status(502).json({ error: "Couldn't parse the generated story — try again." });
    }

    if (!story.title || !Array.isArray(story.pages) || story.pages.length === 0) {
      return res.status(502).json({ error: "The generated story was missing a title or pages — try again." });
    }

    return res.status(200).json({
      title: story.title,
      pages: story.pages,
      // Classification fields are asked for but not hard-required in the
      // response check above — a missing title/pages means there's no
      // usable story at all (a real failure), whereas a missing
      // classification field just means the admin fills that one in
      // manually, same as before this feature existed. Falling back to
      // the brief's own inputs first (if the admin had already typed
      // any of them before generating) rather than silently discarding
      // what they'd entered.
      ageRangeMin: story.ageRangeMin ?? ageRangeMin ?? null,
      ageRangeMax: story.ageRangeMax ?? ageRangeMax ?? null,
      readingLevel: story.readingLevel || readingLevel || null,
      category: story.category || category || null,
      lesson: story.lesson || lesson || null,
    });
  } catch (err) {
    console.error("admin/books/generate error:", err);
    return res.status(500).json({ error: "Unexpected server error." });
  }
}

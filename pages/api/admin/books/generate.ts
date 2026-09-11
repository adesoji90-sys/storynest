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
import { CLAUDE_MODEL } from "@/lib/claudeConfig";
import { requireAdmin } from "@/lib/authAdmin";

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
  return `You are a children's story writer for StoryNest's curated library —
books read by many different families' children, not personalized to any
one child. Write a warm, age-appropriate story of roughly ${wordTarget}
words, split into approximately ${targetPages} pages.

Respond with ONLY valid JSON, no markdown fences, no preamble, in exactly
this shape:
{
  "title": "string",
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
inappropriate for the stated age range. If a lesson is specified, let the
story's ending embody it naturally rather than stating it as a moral.`;
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
    const apiRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY as string,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        thinking: { type: "disabled" },
        max_tokens: Math.min(8000, 1800 + pageCount * 420),
        system: buildSystemPrompt(pageCount),
        messages: [{ role: "user", content: userPrompt }],
      }),
    });

    if (!apiRes.ok) {
      const errText = await apiRes.text();
      console.error("Claude API error:", errText);
      return res.status(502).json({ error: "Story generation failed upstream." });
    }

    const data = await apiRes.json();
    if (data.stop_reason === "max_tokens") {
      console.error("Admin book generation was truncated by max_tokens — raise the budget in this file.");
      return res.status(502).json({ error: "The story ran out of room before finishing — try a shorter page count." });
    }

    const raw = (data.content || [])
      .filter((block: { type: string }) => block.type === "text")
      .map((block: { text: string }) => block.text)
      .join("")
      .trim();

    let story: { title?: string; pages?: { text: string }[] };
    try {
      story = JSON.parse(raw);
    } catch {
      console.error("Failed to parse generated story JSON:", raw.slice(0, 500));
      return res.status(502).json({ error: "Couldn't parse the generated story — try again." });
    }

    if (!story.title || !Array.isArray(story.pages) || story.pages.length === 0) {
      return res.status(502).json({ error: "The generated story was missing a title or pages — try again." });
    }

    return res.status(200).json({ title: story.title, pages: story.pages });
  } catch (err) {
    console.error("admin/books/generate error:", err);
    return res.status(500).json({ error: "Unexpected server error." });
  }
}

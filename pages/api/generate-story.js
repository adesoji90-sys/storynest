// POST /api/generate-story
// Turns the parent's filled-in template fields into a formatted children's
// story using the Claude API. Keep this server-side only — never expose
// ANTHROPIC_API_KEY to the browser.
//
// pageCount comes from the parent's chosen PAGE_TIERS selection (5/10/15 —
// see lib/pricing.js) and drives both the word-count target and the
// returned `pages` estimate, since page count is now what checkout prices
// against. Claude's actual output can land a paragraph or two off the
// target; that's fine for Basic tier since there's no per-page illustration
// pipeline riding on the exact count the way there is for Premium.

import { getPageTier } from "@/lib/pricing";
import { CLAUDE_MODEL } from "@/lib/claudeConfig";

function buildSystemPrompt(targetPages) {
  const wordTarget = targetPages * 80; // roughly 60-100 words read aloud per storybook page
  return `You are a children's story writer for StoryNest, a Nigerian personalized
storybook platform. Write a warm, age-appropriate bedtime story of roughly
${wordTarget} words (a paragraph or two more or fewer is fine) for children
roughly aged 5–12, split into about ${targetPages} short paragraphs — one
paragraph per storybook page. Use simple, vivid sentences. Reflect Nigerian
settings and culture naturally when the input suggests it, without
stereotyping. End with the parent-supplied moral phrase, worked naturally
into the final paragraph. Return ONLY the story text — no titles, no
preamble, no markdown formatting.`;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const {
    template_id,
    title,
    character,
    setting,
    problem,
    helper,
    challenge,
    lesson,
    ending,
    moral_phrase,
    pageTier = "standard",
  } = req.body || {};

  if (!character || !setting || !problem || !challenge || !ending) {
    return res.status(400).json({ error: "Missing required story fields." });
  }

  const targetPages = getPageTier(pageTier).pages;

  const userPrompt = `
Story title: ${title || "(untitled)"}
Main character: ${character}
Setting: ${setting}
The problem: ${problem}
Helper: ${helper || "None"}
The challenge: ${challenge}
The lesson: ${lesson || "Not specified"}
The ending: ${ending}
Moral phrase to close on: ${moral_phrase || "Not specified"}

Write the full story now, following the system instructions.
`.trim();

  try {
    const apiRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: Math.min(4000, targetPages * 220),
        system: buildSystemPrompt(targetPages),
        messages: [{ role: "user", content: userPrompt }],
      }),
    });

    if (!apiRes.ok) {
      const errText = await apiRes.text();
      console.error("Claude API error:", errText);
      return res.status(502).json({ error: "Story generation failed upstream." });
    }

    const data = await apiRes.json();
    const story = (data.content || [])
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("\n\n")
      .trim();

    if (!story) {
      return res.status(502).json({ error: "No story text returned." });
    }

    const pages = story.split(/\n+/).filter(Boolean).length || targetPages;

    return res.status(200).json({
      story,
      title: title || `${character}'s Story`,
      pages,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Unexpected server error." });
  }
}

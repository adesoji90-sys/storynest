// POST /api/generate-story
// Basic tier now produces a fully illustrated book too — the only thing
// that makes Premium "premium" is uploading your own photo instead of
// picking a library character (see README "Basic tier is now illustrated
// too"). This route mirrors generate-story-premium.js's structured output
// (locations + per-page pose/location_id/shot) so /pages/story-builder.js
// can drive the exact same illustration pipeline Premium uses — just
// against one library character instead of a custom photo, and without a
// second/supporting character.
//
// pageCount comes from the parent's chosen PAGE_TIERS selection (5/10/15 —
// see lib/pricing.js).

import { getPageTier } from "@/lib/pricing";
import { CLAUDE_MODEL } from "@/lib/claudeConfig";
import { POSE_IDS, selectPose, isValidPose } from "@/lib/characterPoses";

const SHOT_IDS = ["wide", "medium", "close"];

function buildSystemPrompt(targetPages) {
  const wordTarget = targetPages * 80; // roughly 60-100 words read aloud per storybook page
  return `You are a children's story writer for StoryNest, a Nigerian personalized
storybook platform. Write a warm, age-appropriate bedtime story of roughly
${wordTarget} words (a paragraph or two more or fewer is fine) for a child
roughly aged 5–12, split into approximately ${targetPages} pages.

Respond with ONLY valid JSON, no markdown fences, no preamble, in exactly
this shape:
{
  "title": "string",
  "locations": {
    "<location_id>": "one detailed sentence describing this setting: place, time of day, key visual landmarks, mood — detailed enough to draw consistently every time the story returns here"
  },
  "pages": [
    {
      "text": "2-4 sentence paragraph for this page",
      "illustration_prompt": "one vivid sentence describing the action/interaction in this scene, written for a children's-book illustrator — do NOT re-describe the setting here, that comes from location_id",
      "pose": "one of: ${POSE_IDS.join(", ")}",
      "location_id": "one of the keys in locations",
      "shot": "one of: ${SHOT_IDS.join(", ")}"
    }
  ]
}

The number of items in "pages" should be close to ${targetPages} — a page or
two more or fewer is fine, but don't drift far from that target since it's
what the parent paid for. Identify only the DISTINCT physical settings the
story actually visits (roughly one location per 3-4 pages, sometimes just 1
for a short book) — reuse the SAME location_id every time the story returns
to a place instead of inventing a new one, so it can be drawn consistently.
For "pose", choose whichever id best matches the emotional tone of that
page's scene for the main character — e.g. a page where something goes
wrong is "worried", a page where they succeed or celebrate is "happy", a
page where they're travelling or searching is "determined", a page where
someone asks for or offers help is "helping", a page where they're figuring
something out is "thinking", and "neutral" for anything else. For "shot",
vary the framing across the book rather than repeating the same one —
"wide" for establishing a setting or a big action, "medium" for the
character acting within the setting, "close" for an emotional beat — so
the book doesn't feel like the same static shot repeated. Reflect Nigerian
settings and culture naturally when the input suggests it, without
stereotyping. End the final page's text with the parent-supplied moral
phrase worked in naturally.`;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const {
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
Target page count: ${targetPages}

Write the full story now as JSON, following the system instructions exactly.
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
    const raw = (data.content || [])
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("")
      .trim();

    let parsed;
    try {
      const cleaned = raw.replace(/^```json\s*|\s*```$/g, "");
      parsed = JSON.parse(cleaned);
    } catch {
      console.error("Failed to parse story JSON:", raw);
      return res.status(502).json({ error: "Story came back in an unexpected format." });
    }

    if (!parsed.title || !Array.isArray(parsed.pages) || parsed.pages.length < 2) {
      return res.status(502).json({ error: "Story response was incomplete." });
    }

    const locations =
      parsed.locations && typeof parsed.locations === "object" && Object.keys(parsed.locations).length > 0
        ? parsed.locations
        : {};
    if (!locations.default) {
      locations.default = "a warm, simple setting matching the story's tone";
    }

    parsed.pages = parsed.pages.map((page) => ({
      ...page,
      pose: isValidPose(page.pose) ? page.pose : selectPose(`${page.text} ${page.illustration_prompt || ""}`),
      location_id: page.location_id && locations[page.location_id] ? page.location_id : "default",
      shot: SHOT_IDS.includes(page.shot) ? page.shot : "medium",
    }));
    parsed.locations = locations;

    return res.status(200).json(parsed);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Unexpected server error." });
  }
}

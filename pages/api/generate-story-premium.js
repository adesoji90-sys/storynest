// POST /api/generate-story-premium
// Premium tier: longer story (1000–1400 words), can include a second
// character, and returns structured pages so each one can get its own
// illustration. Returns ONLY JSON from Claude — parsed and validated here.
//
// Each page also gets a "pose" field (see lib/characterPoses.js) and a
// "location_id" field: Claude identifies the distinct physical settings the
// story actually visits, gives each one a rich one-time description under
// top-level "locations", and tags every page with which location it's set
// in. That's what lets /premium-builder generate ONE background per
// location and reuse it every time the story returns there — the same
// generate-once-select-forever principle as character poses, applied to
// environments. A "shot" field (wide/medium/close) also comes from Claude so
// framing varies page to page without the environment itself changing.
//
// If a page comes back with a missing/invalid pose or location, this route
// falls back rather than trusting an unvalidated value — see the
// post-processing below.

import { POSE_IDS, selectPose, isValidPose } from "@/lib/characterPoses";
import { CLAUDE_MODEL } from "@/lib/claudeConfig";

const SHOT_IDS = ["wide", "medium", "close"];
const MIN_PAGES = 3;
const MAX_PAGES = 20;

function buildSystemPrompt(targetPages) {
  const wordTarget = targetPages * 90; // roughly 70-110 words per illustrated page
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
"wide" for establishing a setting or a big action, "medium" for characters
interacting, "close" for an emotional beat — so the book doesn't feel like
the same static shot repeated. Reflect Nigerian settings and culture
naturally when the input suggests it, without stereotyping. End the final
page's text with the parent-supplied moral phrase worked in naturally.`;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const {
    title,
    mainCharacterName,
    supportingCharacterName,
    setting,
    problem,
    helper,
    challenge,
    lesson,
    ending,
    moral_phrase,
    pageCount = 10,
  } = req.body || {};

  if (!mainCharacterName || !setting || !problem || !challenge || !ending) {
    return res.status(400).json({ error: "Missing required story fields." });
  }

  const targetPages = Math.min(MAX_PAGES, Math.max(MIN_PAGES, Number(pageCount) || 10));

  const userPrompt = `
Story title: ${title || "(untitled)"}
Main character (this is the child, illustrated from their own reference image): ${mainCharacterName}
Supporting character: ${supportingCharacterName || "None — main character can have a family member, friend, or animal companion invented for the story"}
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
        // See generate-story.js for why thinking is disabled and why this
        // budget is much larger than the page count alone would suggest —
        // same root cause (adaptive thinking sharing the token budget,
        // undersized formula) affected this route identically.
        thinking: { type: "disabled" },
        max_tokens: Math.min(8000, 1800 + targetPages * 420),
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
    if (data.stop_reason === "max_tokens") {
      // See generate-story.js for why this check exists — the unambiguous
      // signature of a token-budget truncation, distinct from a genuine
      // malformed-JSON response.
      console.error("Story generation was truncated by max_tokens — raise the budget in this file.");
      return res.status(502).json({ error: "The story ran out of room before finishing — please try again." });
    }
    const raw = (data.content || [])
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();

    let parsed;
    try {
      // Strip a stray ```json fence if the model adds one despite instructions.
      const cleaned = raw.replace(/^```json\s*|\s*```$/g, "");
      parsed = JSON.parse(cleaned);
    } catch (e) {
      console.error("Failed to parse story JSON:", raw);
      return res.status(502).json({ error: "Story came back in an unexpected format." });
    }

    if (!parsed.title || !Array.isArray(parsed.pages) || parsed.pages.length < Math.min(MIN_PAGES, targetPages)) {
      return res.status(502).json({ error: "Story response was incomplete." });
    }

    // Validate locations: must be a non-empty object of string descriptions.
    // If missing entirely, fall back to one shared location per page so
    // illustration generation still has something to work with — no
    // cross-page consistency in that fallback case, but nothing breaks.
    const locations =
      parsed.locations && typeof parsed.locations === "object" && Object.keys(parsed.locations).length > 0
        ? parsed.locations
        : {};
    if (!locations.default) {
      locations.default = "a warm, simple setting matching the story's tone";
    }

    // Validate each page's pose, location_id, and shot against known values
    // — never trust an unvalidated value from the model.
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

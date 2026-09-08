// A small, fixed set of poses covers most children's-story beats. Each
// library character gets these generated ONCE per pose (not per story) and
// cached — see /api/get-or-generate-character. Building a story never
// generates a new pose; it only SELECTS the closest cached one by matching
// keywords against that page's illustration prompt. "neutral" is always the
// fallback so selection never fails to return something.

// A real, observed bug this fixes, across two rounds of wording-only
// attempts: the ORIGINAL version just said "full body visible" with no
// margin instruction — a model cropped a character's head tight against a
// square frame's top edge to keep the figure large. Adding margin
// language fixed that case, then a DIFFERENT character came back with the
// same crop at the FEET instead. Adding an explicit height-percentage
// requirement helped but didn't fully solve it either — a real test still
// showed tight-to-cropped feet even with good head margin. The actual fix
// wasn't more precise wording: it was recognizing that a full standing
// body is a genuinely awkward fit for a SQUARE frame regardless of how
// the prompt is worded, and generating character poses on a taller
// (1024x1536) canvas instead (see generate-character-image.js and
// lib/generateLibraryCharacterPose.js) — a shape a standing figure
// actually fits into comfortably. This wording is now a reasonable
// safety net on top of that structural fix, not the primary mechanism.
const SAFE_FRAMING =
  "full-length standing figure with comfortable empty margin above the head and below the feet — the top of the head and hair, and the feet and shoes, must be completely visible, never touching or extending past the top or bottom edge of the frame, plain white background";

export const POSES = [
  {
    id: "neutral",
    label: "Standing, calm",
    prompt: `standing naturally with a warm, calm smile, ${SAFE_FRAMING}`,
    keywords: [],
  },
  {
    id: "happy",
    label: "Celebrating",
    prompt: `laughing and celebrating with arms raised in joy, ${SAFE_FRAMING}`,
    keywords: ["happy", "celebrat", "laugh", "joy", "win", "success", "proud", "smil", "party"],
  },
  {
    id: "worried",
    label: "Worried",
    prompt: `looking worried and concerned, one hand near their chin, ${SAFE_FRAMING}`,
    keywords: ["worried", "lost", "sad", "problem", "upset", "scared", "afraid", "nervous", "cry"],
  },
  {
    id: "determined",
    label: "Walking / exploring",
    prompt: `walking forward with determination, looking ahead, ${SAFE_FRAMING}`,
    keywords: ["walk", "explore", "search", "journey", "adventure", "look for", "market", "travel", "run"],
  },
  {
    id: "helping",
    label: "Helping / asking for help",
    prompt: `reaching out a hand warmly, as if offering or asking for help, ${SAFE_FRAMING}`,
    keywords: ["help", "ask", "reach", "helper", "team", "together", "share", "hand"],
  },
  {
    id: "thinking",
    label: "Thinking / curious",
    prompt: `tilting their head thoughtfully with a finger near their chin, curious expression, ${SAFE_FRAMING}`,
    keywords: ["think", "wonder", "curious", "idea", "plan", "figure", "puzzle", "mystery", "why"],
  },
];

export function getPose(id) {
  return POSES.find((p) => p.id === id) || POSES[0];
}

export const POSE_IDS = POSES.map((p) => p.id);

export function isValidPose(id) {
  return POSE_IDS.includes(id);
}

// Fallback ONLY. The primary pose choice comes from Claude, which writes a
// "pose" field per page as part of generate-story-premium.js's structured
// output — it already understands each scene's emotional beat far better
// than substring matching. This keyword matcher exists purely as a safety
// net for when that field is missing or comes back invalid.
export function selectPose(sceneText) {
  const text = (sceneText || "").toLowerCase();
  let best = POSES[0];
  let bestScore = 0;
  for (const pose of POSES) {
    const score = pose.keywords.reduce((acc, kw) => acc + (text.includes(kw) ? 1 : 0), 0);
    if (score > bestScore) {
      bestScore = score;
      best = pose;
    }
  }
  return best.id;
}

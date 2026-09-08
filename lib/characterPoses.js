// A small, fixed set of poses covers most children's-story beats. Each
// library character gets these generated ONCE per pose (not per story) and
// cached — see /api/get-or-generate-character. Building a story never
// generates a new pose; it only SELECTS the closest cached one by matching
// keywords against that page's illustration prompt. "neutral" is always the
// fallback so selection never fails to return something.

// A real, observed bug this fixes: the ORIGINAL version just said "full
// body visible" with no margin instruction — a well-known trigger for a
// model to crop tight against the top of the head to keep the figure large
// within a square frame. That was fixed once already, then a SECOND real
// case turned up: even with "margin around all sides" added, a character
// (Ikenna) came back with his feet cropped at the BOTTOM instead — same
// underlying tension, different edge. "Full body visible" and "leave
// margin everywhere" compete with each other, and a model doesn't follow
// compound spatial instructions with 100% reliability; it can satisfy one
// part (a large, recognizable figure) at the expense of the other (margin
// on every edge) unpredictably. This version is more explicit and
// quantified — a specific height percentage, explicit mention of feet and
// shoes by name (not just "any part of the body"), and explicit language
// about never touching or extending past an edge — but this is prompt
// engineering against a probabilistic model, not a guarantee. If a
// specific character/pose still comes out cropped after this, the
// practical fix is the same as before: force-regenerate that one via
// /api/admin/regenerate-characters (a different random generation may
// simply come out better), not a further prompt tweak every single time.
const SAFE_FRAMING =
  "full-length standing figure occupying no more than 70% of the total image height, centered both horizontally and vertically, with clearly visible empty margin above the head, below the feet, and on both sides — the top of the head and hair, and the feet and shoes, must ALL be completely visible with room to spare and must never touch or extend past any edge of the frame, plain white background";

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

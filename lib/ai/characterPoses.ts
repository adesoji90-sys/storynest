// Direct port of lib/characterPoses.js. The SAFE_FRAMING fix (a tall
// 1024x1536 canvas + explicit margin language, rather than just wording
// tweaks) is a real, hard-won fix from two rounds of observed cropping
// bugs on the old pipeline — kept exactly as-is rather than
// "improved," since it's already the result of actual testing, not a
// guess.

export interface CharacterPose {
  id: string;
  label: string;
  prompt: string;
  keywords: string[];
}

const SAFE_FRAMING =
  "full-length standing figure with comfortable empty margin above the head and below the feet — the top of the head and hair, and the feet and shoes, must be completely visible, never touching or extending past the top or bottom edge of the frame, plain white background";

export const POSES: CharacterPose[] = [
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

export function getPose(id?: string): CharacterPose {
  return POSES.find((p) => p.id === id) || POSES[0]!;
}

// Fallback only, same as the old system — a real story-generation model
// could write a "pose" field per page directly (it understands a scene's
// emotional beat far better than substring matching), but nothing does
// that yet on the new platform's side, so this keyword matcher is the
// only pose-selection mechanism for now, not a safety net on top of one.
export function selectPose(sceneText: string): string {
  const text = (sceneText || "").toLowerCase();
  let best = POSES[0]!;
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

// POST /api/narration-preview
//
// Lets a parent (or admin) hear a voice + speed combination BEFORE
// spending real generation cost narrating an entire book — a short,
// fixed sample phrase, never stored or persisted anywhere, just
// streamed straight back for immediate playback. Not gated by
// checkCustomBooksAllowed or any entitlement — previewing a voice
// costs a small, fixed amount regardless of tier, and blocking it
// wouldn't protect anything meaningful (the real spend gate is on
// actually narrating a full book, not on hearing a few seconds of
// sample audio).
import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import { requireFamily } from "@/lib/authFamily";
import { requireAdmin } from "@/lib/authAdmin";
import { getNarrationProvider, NARRATION_TONES } from "@/lib/ai/NarrationProvider";

export const config = {
  maxDuration: 60,
};

const PreviewSchema = z.object({
  tone: z.enum(Object.keys(NARRATION_TONES) as [string, ...string[]]),
  speed: z.number().min(0.7).max(1.2).optional(),
});

const SAMPLE_TEXT = "Once upon a time, in a warm and colorful land, an adventure was about to begin.";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Either a signed-in family member OR an admin may preview a voice —
  // this runs from both Story Studio and the admin panel's narration
  // pickers, so it accepts whichever identity is actually signed in
  // rather than requiring one specific role.
  const familyAuth = await requireFamily(req);
  if (!familyAuth.ok) {
    const adminAuth = await requireAdmin(req);
    if (!adminAuth.ok) {
      return res.status(401).json({ error: "Sign in required." });
    }
  }

  const parsed = PreviewSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid tone or speed." });
  }

  try {
    const provider = getNarrationProvider();
    const result = await provider.generateNarration({
      text: SAMPLE_TEXT,
      voiceId: NARRATION_TONES[parsed.data.tone]!.voiceId,
      speed: parsed.data.speed,
    });
    return res.status(200).json({ base64: result.base64, mimeType: result.mimeType });
  } catch (err) {
    console.error("narration-preview error:", err);
    return res.status(502).json({ error: "Couldn't generate a preview right now." });
  }
}

// Real implementation of NarrationProvider. MODEL CHOICE IS DELIBERATE
// and worth explaining: gpt-4o-mini-tts (OpenAI's newer, more
// expressive model, with tone-steering "instructions") has a real,
// currently unresolved issue reported repeatedly on OpenAI's own
// developer forum — separate API calls with the identical voice and
// instructions produce audibly different-sounding output, with no
// seed or consistency mechanism available. One developer there
// explicitly switched back to tts-1 for exactly this reason. Since a
// children's book narrated in a voice that noticeably shifts partway
// through is a worse experience than a slightly more rigid but
// CONSISTENT voice, this uses tts-1 — trading away the "instructions"
// tone-steering parameter (tts-1 doesn't support it) for reliability
// across a whole book's worth of separate per-page calls.
//
// COMPLIANCE NOTE, not optional: OpenAI's usage policy requires
// disclosing to end users that a TTS voice is AI-generated, not human.
// This provider doesn't enforce that itself (it just generates audio),
// but every UI surface that plays narration back MUST show that
// disclosure — see the reader page's narration player for where this
// is actually satisfied.
//
// durationMs is ESTIMATED from word count at a slow, storytelling pace
// (130 words/minute — deliberately slower than typical adult-speech
// estimates, since this is read-aloud children's narration, not fast
// conversational speech), not measured from the real generated audio.
// Parsing an MP3 file's actual duration from its bytes is real,
// separate work this pass doesn't do — flagged as an approximation,
// not presented as exact.

import { fetchOpenAIWithRetry } from "@/lib/openaiFetch";
import type { NarrationProvider, NarrationRequest, NarrationResult } from "./types";

const TTS_MODEL = "tts-1";
const DEFAULT_VOICE = "coral"; // warm, positive tone per OpenAI's own example usage
const WORDS_PER_MINUTE = 130;

export class OpenAITTSProvider implements NarrationProvider {
  async generateNarration(request: NarrationRequest): Promise<NarrationResult> {
    const apiRes = await fetchOpenAIWithRetry("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: TTS_MODEL,
        voice: request.voiceId || DEFAULT_VOICE,
        input: request.text,
        // tts-1 does not support "instructions" (that's a
        // gpt-4o-mini-tts-only parameter) — deliberately omitted here,
        // not forgotten.
      }),
    });

    if (!apiRes || !apiRes.ok) {
      const errText = apiRes ? await apiRes.text() : "No response from OpenAI after retries.";
      console.error("TTS API error:", errText);
      throw new Error("Narration generation failed upstream.");
    }

    const arrayBuffer = await apiRes.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString("base64");

    const wordCount = request.text.trim().split(/\s+/).filter(Boolean).length;
    const durationMs = Math.round((wordCount / WORDS_PER_MINUTE) * 60000);

    return { base64, mimeType: "audio/mpeg", durationMs, model: TTS_MODEL };
  }
}

export function getNarrationProvider(): NarrationProvider {
  return new OpenAITTSProvider();
}

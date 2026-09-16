// Real implementation of NarrationProvider — switched from OpenAI's
// tts-1 to ElevenLabs specifically for genuine African-accented voices,
// which OpenAI's voices don't offer (confirmed via their own docs and
// developer community — their voices are English-optimized with a US
// accent by design, and there's an open community request for exactly
// this that OpenAI hasn't built). ElevenLabs uses fixed, named voice
// IDs rather than a text-instructed accent, which is also why this
// should avoid the cross-call consistency problem gpt-4o-mini-tts had
// — the same voice ID is the same trained voice every time, not a
// fresh interpretation of an instruction each call.
//
// The four voices below were chosen by listening to ElevenLabs' own
// Voice Library directly (something this environment has no way to do
// itself) and are kept as the only four options, matching the
// "exactly three, now four" fixed-choice pattern the tone selector
// already used — a parent picks a voice, not an open-ended library.
export const NARRATION_TONES: Record<string, { label: string; voiceId: string }> = {
  calm_female: { label: "Calm & Soothing (Female)", voiceId: "kYVRaUTOr10bND4ysEq9" },
  engaging_male: { label: "Engaging & Clear (Male)", voiceId: "eOHsvebhdtt0XFeHVMQY" },
  natural_male: { label: "Calm & Natural (Male)", voiceId: "qsiRIDxZEoXB7eXEuRFz" },
  warm_female: { label: "Warm & Relatable (Female)", voiceId: "yp4MmTRKvE7VXY3hUJRY" },
};
export const DEFAULT_NARRATION_TONE = "warm_female";

// COMPLIANCE NOTE, not optional: an AI-generated voice being disclosed
// as such to listeners is good practice regardless of provider — this
// provider doesn't enforce that itself (it just generates audio), but
// every UI surface that plays narration back MUST show that
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

const WORDS_PER_MINUTE = 130;
// eleven_multilingual_v2 chosen over the cheaper/faster Flash models —
// this generates stored, final audio a family listens to repeatedly,
// not a live/real-time response, so quality is worth more here than
// the latency Flash models optimize for.
const ELEVEN_MODEL = "eleven_multilingual_v2";

import { fetchOpenAIWithRetry } from "@/lib/openaiFetch";
import type { NarrationProvider, NarrationRequest, NarrationResult } from "./types";

// Reused deliberately, despite the name — it's a generic
// "retry-on-429-with-backoff" fetch wrapper with no OpenAI-specific
// logic in it at all (see lib/openaiFetch.js itself), and ElevenLabs'
// API can rate-limit the same way any provider can. Not worth
// duplicating the same retry logic under a second filename for a
// naming purity that doesn't change what the code does.
export class ElevenLabsTTSProvider implements NarrationProvider {
  async generateNarration(request: NarrationRequest): Promise<NarrationResult> {
    const voiceId = request.voiceId || NARRATION_TONES[DEFAULT_NARRATION_TONE]!.voiceId;

    const apiRes = await fetchOpenAIWithRetry(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "xi-api-key": process.env.ELEVENLABS_API_KEY as string,
      },
      body: JSON.stringify({
        text: request.text,
        model_id: ELEVEN_MODEL,
      }),
    });

    if (!apiRes || !apiRes.ok) {
      const errText = apiRes ? await apiRes.text() : "No response from ElevenLabs after retries.";
      console.error("ElevenLabs TTS API error:", errText);
      throw new Error("Narration generation failed upstream.");
    }

    // ElevenLabs returns raw audio bytes directly, not a JSON envelope
    // like OpenAI's endpoint does — no base64 field to pull out, just
    // the response body itself.
    const arrayBuffer = await apiRes.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString("base64");

    const wordCount = request.text.trim().split(/\s+/).filter(Boolean).length;
    const durationMs = Math.round((wordCount / WORDS_PER_MINUTE) * 60000);

    return { base64, mimeType: "audio/mpeg", durationMs, model: ELEVEN_MODEL };
  }
}

export function getNarrationProvider(): NarrationProvider {
  return new ElevenLabsTTSProvider();
}

// The first real implementation of ImageProvider — adapts the existing,
// already-proven illustration pipeline from the old StoryNest routes
// (generate-illustrations.js, generateLibraryCharacterPose.js) rather
// than inventing a new approach. Reuses the exact same model, retry
// logic, and — for the references case — the "this is a
// character-placement task, not a redesign" prompting technique that
// route's own comments document as the tested middle ground between
// full flexibility and character consistency.
//
// Two real OpenAI endpoints depending on whether references are
// supplied: /v1/images/generations for a from-scratch image (character
// reference portraits), /v1/images/edits for placing an already-
// designed character into a new scene (page illustrations).

import { IMAGE_MODEL, IMAGE_QUALITY } from "@/lib/imageConfig";
import { fetchOpenAIWithRetry } from "@/lib/openaiFetch";
import type { ImageProvider, ImageGenerationRequest, ImageGenerationResult } from "./types";

function closestSupportedSize(width: number, height: number): string {
  // gpt-image-1.5 only accepts a small fixed set of sizes, not
  // arbitrary dimensions — snapping to the closest supported one rather
  // than failing on anything that isn't an exact match.
  const ratio = width / height;
  if (ratio > 1.2) return "1536x1024"; // landscape
  if (ratio < 0.85) return "1024x1536"; // portrait
  return "1024x1024"; // square
}

export class OpenAIImageProvider implements ImageProvider {
  async generateImage(request: ImageGenerationRequest): Promise<ImageGenerationResult> {
    const size = closestSupportedSize(request.width, request.height);
    const hasReferences = request.references && request.references.length > 0;

    const apiRes = hasReferences
      ? await this.generateWithReferences(request, size)
      : await this.generateFromScratch(request, size);

    if (!apiRes || !apiRes.ok) {
      const errText = apiRes ? await apiRes.text() : "No response from OpenAI after retries.";
      console.error("Image API error:", errText);
      throw new Error("Image generation failed upstream.");
    }

    const data = await apiRes.json();
    const base64 = data?.data?.[0]?.b64_json;
    if (!base64) {
      throw new Error("No image returned.");
    }

    return { base64, model: IMAGE_MODEL };
  }

  private async generateFromScratch(request: ImageGenerationRequest, size: string) {
    return fetchOpenAIWithRetry("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: IMAGE_MODEL,
        quality: IMAGE_QUALITY,
        prompt: request.prompt,
        size,
      }),
    });
  }

  private async generateWithReferences(request: ImageGenerationRequest, size: string) {
    const form = new FormData();
    form.append("model", IMAGE_MODEL);
    form.append("quality", IMAGE_QUALITY);

    (request.references || []).forEach((ref, idx) => {
      form.append(
        "image[]",
        new Blob([Buffer.from(ref.base64, "base64")], { type: "image/png" }),
        `ref_${idx}_${ref.label || "reference"}.png`
      );
    });

    // Same "placement, not redesign" framing as the old pipeline's
    // generate-illustrations.js — kept verbatim since that file's own
    // comments document real testing behind this specific wording, not
    // a guess worth second-guessing here.
    const castLine = (request.references || [])
      .map((ref) => `the character shown in ${ref.label}`)
      .join(" and ");

    form.append(
      "prompt",
      `This is a character-placement task, not a redesign. ${
        castLine
          ? `${castLine.charAt(0).toUpperCase()}${castLine.slice(1)} ${(request.references || []).length > 1 ? "are" : "is"} already fully designed exactly as shown in the reference image(s)`
          : "The reference image(s) already show exactly how each character must look"
      } — do not redesign, reinterpret, or alter their face, hairstyle, outfit, or outfit colors in any way. Your only job is to place that exact character, unchanged, into the scene described below, adding only the lighting, shadow, and perspective needed to integrate them naturally with the setting.
      Scene: ${request.prompt}`
    );
    form.append("size", size);

    return fetchOpenAIWithRetry("https://api.openai.com/v1/images/edits", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: form,
    });
  }
}

export function getImageProvider(): ImageProvider {
  return new OpenAIImageProvider();
}

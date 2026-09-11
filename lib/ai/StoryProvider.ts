// The only real provider implementation right now. This consolidates
// logic that was previously copy-pasted in two places
// (admin/books/generate.ts and story-studio/[storyId]/generate.ts) —
// the actual Anthropic API call, the max_tokens truncation check, and
// extracting text from the response's content blocks. Both call sites
// now go through this instead of duplicating it a third time (or
// drifting out of sync the way two independent copies eventually do).

import { CLAUDE_MODEL } from "@/lib/claudeConfig";
import type { StoryProvider, StoryGenerationRequest, StoryGenerationResult } from "./types";

export class AnthropicStoryProvider implements StoryProvider {
  async generateStory(request: StoryGenerationRequest): Promise<StoryGenerationResult> {
    const apiRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY as string,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        thinking: { type: "disabled" },
        max_tokens: request.maxTokens,
        system: request.systemPrompt,
        messages: [{ role: "user", content: request.userPrompt }],
      }),
    });

    if (!apiRes.ok) {
      const errText = await apiRes.text();
      console.error("Claude API error:", errText);
      throw new Error("Story generation failed upstream.");
    }

    const data = await apiRes.json();
    if (data.stop_reason === "max_tokens") {
      console.error("Story generation was truncated by max_tokens — raise the request's maxTokens.");
      throw new Error("The story ran out of room before finishing — try a shorter page count.");
    }

    const rawText = (data.content || [])
      .filter((block: { type: string }) => block.type === "text")
      .map((block: { text: string }) => block.text)
      .join("")
      .trim();

    return {
      rawText,
      inputTokens: data.usage?.input_tokens ?? null,
      outputTokens: data.usage?.output_tokens ?? null,
      model: CLAUDE_MODEL,
    };
  }
}

// Factory rather than a bare exported instance — this is the one line
// that would change to swap providers (e.g. based on an env var) later,
// without touching any call site.
export function getStoryProvider(): StoryProvider {
  return new AnthropicStoryProvider();
}

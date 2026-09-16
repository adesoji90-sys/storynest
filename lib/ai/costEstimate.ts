// Rough cost estimation for AIUsageRecord (Section 16 — mandatory for
// every AI operation). "Rough" is doing real work in that sentence:
// PLACEHOLDER RATES below, not sourced from a live pricing API or
// updated exchange rate — same spirit as Plan.priceMinorUnits being a
// stand-in pending a real business decision. Good enough to see
// relative cost between operations and catch runaway usage; not
// accurate enough for financial reporting without someone reviewing
// and updating these two constants against real, current numbers.
//
// This gap existed silently before this refactor — neither
// admin/books/generate.ts nor story-studio's generate.ts created an
// AIUsageRecord at all. Centralizing the provider call is what makes it
// practical to fix consistently instead of duplicating (or forgetting)
// this at every call site.

const CLAUDE_COST_PER_MILLION_INPUT_TOKENS_USD = 3;
const CLAUDE_COST_PER_MILLION_OUTPUT_TOKENS_USD = 15;
export const USD_TO_NGN_KOBO_RATE = 150000; // 1 USD ≈ ₦1,500 = 150,000 kobo — placeholder, update against a real rate. Exported (not just used internally) so the dashboard can display the actual rate behind its NGN figures, not just the converted numbers.

export function estimateStoryGenerationCostKobo(inputTokens: number | null, outputTokens: number | null): number {
  const inputCostUsd = ((inputTokens || 0) / 1_000_000) * CLAUDE_COST_PER_MILLION_INPUT_TOKENS_USD;
  const outputCostUsd = ((outputTokens || 0) / 1_000_000) * CLAUDE_COST_PER_MILLION_OUTPUT_TOKENS_USD;
  return Math.round((inputCostUsd + outputCostUsd) * USD_TO_NGN_KOBO_RATE);
}

// Sourced from lib/imageConfig.js's own comment (gpt-image-1.5 pricing at
// 1024x1024, checked against OpenAI's pricing page when that file was
// written) rather than a fresh guess — real image-generation cost is
// per-image at a given quality tier, not per-token, so this doesn't need
// input/output token counts the way story generation does.
const IMAGE_COST_USD: Record<string, number> = {
  low: 0.009,
  medium: 0.034,
  high: 0.133,
};

export function estimateImageGenerationCostKobo(quality: string): number {
  const costUsd = IMAGE_COST_USD[quality] ?? IMAGE_COST_USD.medium ?? 0.034;
  return Math.round(costUsd * USD_TO_NGN_KOBO_RATE);
}

// Sourced from ElevenLabs' own current API pricing (checked via
// search: ~$0.10 per 1,000 characters for the Multilingual v2 model
// this app actually uses, i.e. $100 per million) — a real, current
// figure at the time this was written, not the rough OpenAI-based
// placeholder this replaced. Still worth a periodic check against
// ElevenLabs' live pricing page, same as every other cost estimate in
// this file — providers change rates.
const TTS_COST_USD_PER_MILLION_CHARS = 100;

export function estimateNarrationCostKobo(characterCount: number): number {
  const costUsd = (characterCount / 1_000_000) * TTS_COST_USD_PER_MILLION_CHARS;
  return Math.round(costUsd * USD_TO_NGN_KOBO_RATE);
}

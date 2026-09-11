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
const USD_TO_NGN_KOBO_RATE = 150000; // 1 USD ≈ ₦1,500 = 150,000 kobo — placeholder, update against a real rate

export function estimateStoryGenerationCostKobo(inputTokens: number | null, outputTokens: number | null): number {
  const inputCostUsd = ((inputTokens || 0) / 1_000_000) * CLAUDE_COST_PER_MILLION_INPUT_TOKENS_USD;
  const outputCostUsd = ((outputTokens || 0) / 1_000_000) * CLAUDE_COST_PER_MILLION_OUTPUT_TOKENS_USD;
  return Math.round((inputCostUsd + outputCostUsd) * USD_TO_NGN_KOBO_RATE);
}

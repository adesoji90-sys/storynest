// Single source of truth for which OpenAI image model and quality tier
// every image-generation route uses. Change it here, not per-file.
//
// MODEL: upgraded from gpt-image-1.5 to gpt-image-2 (released April
// 2026) specifically for character consistency — OpenAI's own
// materials for this model call out children's book illustration by
// name as a target use case, via a "Thinking mode" that maintains the
// same character's identity across multiple generated images. This
// app doesn't use Thinking mode's multi-image-per-call feature yet
// (that's a further real improvement, not built in this pass), but the
// base model upgrade alone should measurably help consistency, and
// costs nothing extra to try since generation still goes through the
// same /v1/images/generations and /v1/images/edits endpoints.
//
// HONEST CAVEAT, found via search rather than assumption: there is
// some conflicting information about whether /v1/images/edits (the
// endpoint character-consistent scene illustration depends on) fully
// supports gpt-image-2 on every account yet — some report a rejection
// error, official-looking docs list it as supported. This is why the
// upgrade is kept to this one line rather than restructured around —
// if page illustration starts failing after this change, that's the
// first thing to check, and reverting is exactly this one line back
// to "gpt-image-1.5".
//
// QUALITY: "low" | "medium" | "high" — trades cost for detail. Pricing
// differs from gpt-image-1.5's — check OpenAI's current pricing page
// for gpt-image-2 specifically before assuming the old $0.009/$0.034/
// $0.133 figures still apply (lib/ai/costEstimate.ts's estimate hasn't
// been re-verified against gpt-image-2's real pricing yet — flagged
// there too). "medium" is a reasonable default for a paid product;
// "low" is fine for local testing so you're not paying flagship rates
// every time you click "generate" during development.

export const IMAGE_MODEL = "gpt-image-2";
export const IMAGE_QUALITY = process.env.IMAGE_QUALITY || "medium";

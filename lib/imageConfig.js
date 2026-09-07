// Single source of truth for which OpenAI image model and quality tier
// every image-generation route uses. Change it here, not per-file.
//
// MODEL: gpt-image-1 is deprecated by OpenAI on October 23, 2026 — this
// app targets gpt-image-1.5 (the current flagship) instead. If OpenAI
// ships a newer model before you launch, check their docs and update this
// one line rather than hunting through every route.
//
// QUALITY: "low" | "medium" | "high" — trades cost for detail. Roughly, on
// gpt-image-1.5, a 1024x1024 output is $0.009 / $0.034 / $0.133 for
// low/medium/high (check OpenAI's current pricing page before launch,
// this changes). "medium" is a reasonable default for a paid product;
// "low" is fine for local testing so you're not paying flagship rates
// every time you click "generate" during development.

export const IMAGE_MODEL = "gpt-image-1.5";
export const IMAGE_QUALITY = process.env.IMAGE_QUALITY || "medium";

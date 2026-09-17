// ONE-TIME script — not part of the running app, not called by any
// route. Run this once, locally, where your real OPENAI_API_KEY is
// available (your .env.local), to generate the landing page's hero
// illustration as an actual static file instead of hand-coded SVG.
//
// Usage:
//   node scripts/generate-hero-image.js
//
// Requires OPENAI_API_KEY to be set in your environment (or in
// .env.local, loaded automatically if you run this via
// `node -r dotenv/config scripts/generate-hero-image.js` — plain
// `node scripts/generate-hero-image.js` only works if the key is
// already exported in your shell).
//
// Writes to public/hero.png, which pages/index.js already references
// directly via a plain <img> tag — no code change needed after this
// runs, just re-run it if you want a different result.

const fs = require("fs");
const path = require("path");

const IMAGE_MODEL = "gpt-image-2"; // matches lib/imageConfig.js — kept in sync manually since this script runs standalone, outside the app's own module graph
const IMAGE_QUALITY = "high"; // a one-time hero image is worth the higher-quality tier, unlike per-page generation cost at scale

const PROMPT = `A warm, painterly children's-book illustration of a mother and
father sitting on either side of their young child in bed at night,
reading an open storybook together. Cozy bedside lamp light, a starry
night sky visible, warm and tender family moment. Rich warm color
palette: deep Kente purple (#4A1D6E), bright coral-red accents
(#E63946), vivid Kente gold tones (#F5B700), warm cream highlights
(#FFF8ED), and rich emerald green (#0B6E4F). Storybook illustration style —
warm, inviting, not photorealistic. Landscape orientation, wide
composition suitable for a website hero image, no text or lettering
anywhere in the image.`;

async function main() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error("OPENAI_API_KEY is not set in this shell's environment. Set it and re-run.");
    process.exit(1);
  }

  console.log("Requesting hero image from OpenAI...");
  const res = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: IMAGE_MODEL,
      quality: IMAGE_QUALITY,
      prompt: PROMPT,
      size: "1536x1024", // landscape, matches a hero image's proportions
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error("OpenAI API error:", errText);
    process.exit(1);
  }

  const data = await res.json();
  const base64 = data?.data?.[0]?.b64_json;
  if (!base64) {
    console.error("No image data in the response.");
    process.exit(1);
  }

  const outPath = path.join(__dirname, "..", "public", "hero.png");
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, Buffer.from(base64, "base64"));
  console.log(`Saved to ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

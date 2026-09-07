// POST /api/generate-illustrations
// Body: { scenes: [ { prompt, shot, characters: [{label, base64}|{label,url}], setting?: {label, base64}|{label,url} } ] }
//
// By the time a request reaches this route, every reference has already
// been SELECTED, not generated: character poses came from their
// pre-generated sets (custom character at upload, library character
// cached), and the setting image came from that story's one cached
// background per location (see generate-location-background.js). This
// route's only job is compositing those fixed references into one new
// scene per page — it never creates a new version of a character OR a new
// version of a setting; only the specific action/framing of this page is
// new.
//
// gpt-image-1.5's edit endpoint accepts multiple input images via repeated
// `image[]` fields — check OpenAI's current docs before deploying, since
// multi-image editing support has changed across API versions.
//
// TIMEOUT WARNING: see the README ("Premium tier setup") — many sequential
// image generations will not fit inside Vercel Hobby's function duration
// limit. This route batches requests concurrently to help, but a production
// version should move to a background job + polling.

import { STYLE_GUIDE } from "@/lib/imageStyle";
import { IMAGE_MODEL, IMAGE_QUALITY } from "@/lib/imageConfig";

export const config = {
  maxDuration: 60,
};

const CONCURRENCY = 3;

async function resolveToBase64(ref) {
  if (ref.base64) return ref.base64;
  if (ref.url) {
    const res = await fetch(ref.url);
    if (!res.ok) throw new Error(`Couldn't fetch reference image: ${ref.url}`);
    const buf = Buffer.from(await res.arrayBuffer());
    return buf.toString("base64");
  }
  throw new Error("Reference image needs either base64 or url.");
}

async function generateOne(characterRefs, settingRef, prompt, shot) {
  const form = new FormData();
  form.append("model", IMAGE_MODEL);
  form.append("quality", IMAGE_QUALITY);

  const allRefs = settingRef ? [...characterRefs, settingRef] : characterRefs;
  allRefs.forEach((img, idx) => {
    form.append(
      "image[]",
      new Blob([Buffer.from(img.base64, "base64")], { type: "image/png" }),
      `ref_${idx}_${img.label || "reference"}.png`
    );
  });

  const castLine = characterRefs.map((img) => `the character shown in ${img.label}`).join(" and ");
  const shotInstruction =
    shot === "wide"
      ? "Use a wide establishing shot showing the full setting."
      : shot === "close"
      ? "Use a close, intimate framing focused on the character(s) and their expression."
      : "Use a medium shot showing the character(s) interacting within the setting.";

  const settingInstruction = settingRef
    ? `The background/environment MUST match the reference labeled "${settingRef.label}" exactly — same architecture, colors, layout, and lighting as that reference, just viewed from whichever angle this shot calls for. Do not invent a different-looking setting.`
    : "";

  form.append(
    "prompt",
    `Using the reference image(s) provided — ${castLine}${settingRef ? ` and the setting reference labeled "${settingRef.label}"` : ""} —
    illustrate this scene: ${prompt}
    Each character must recognizably match their own reference exactly (same face, hair, and outfit as shown), interacting naturally with each other where the scene calls for it.
    ${settingInstruction}
    ${shotInstruction}
    Match the same style across all characters and the background: ${STYLE_GUIDE}.`
  );
  form.append("size", "1024x1024");

  const apiRes = await fetch("https://api.openai.com/v1/images/edits", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: form,
  });

  if (!apiRes.ok) {
    const errText = await apiRes.text();
    console.error("Illustration API error:", errText);
    return null;
  }
  const data = await apiRes.json();
  return data?.data?.[0]?.b64_json || null;
}

async function runInBatches(items, worker, concurrency) {
  const results = new Array(items.length).fill(null);
  let cursor = 0;
  async function next() {
    while (cursor < items.length) {
      const i = cursor++;
      results[i] = await worker(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, next));
  return results;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { scenes } = req.body || {};
  if (!Array.isArray(scenes) || scenes.length === 0) {
    return res.status(400).json({ error: "No scenes provided." });
  }
  if (scenes.length > 20) {
    return res.status(400).json({ error: "Too many scenes — max 20 per story." });
  }
  for (const scene of scenes) {
    if (!Array.isArray(scene.characters) || scene.characters.length === 0) {
      return res.status(400).json({ error: "Every scene needs at least one character reference." });
    }
    if (scene.characters.length > 3) {
      return res.status(400).json({ error: "Too many reference characters in one scene — max 3." });
    }
  }

  try {
    // Resolve each unique URL reference to base64 exactly once — most
    // scenes share the same handful of pre-generated poses and the same
    // handful of location backgrounds, so this avoids re-fetching the same
    // cached image over and over.
    const urlCache = new Map();
    async function resolveCached(url) {
      if (!urlCache.has(url)) urlCache.set(url, resolveToBase64({ url }));
      return urlCache.get(url);
    }

    const scenesResolved = await Promise.all(
      scenes.map(async (scene) => {
        const characterRefs = await Promise.all(
          scene.characters.map(async (c) => ({
            label: c.label || "character",
            base64: c.base64 || (await resolveCached(c.url)),
          }))
        );
        const settingRef = scene.setting
          ? {
              label: scene.setting.label || "setting",
              base64: scene.setting.base64 || (await resolveCached(scene.setting.url)),
            }
          : null;
        return { prompt: scene.prompt, shot: scene.shot, characterRefs, settingRef };
      })
    );

    const images = await runInBatches(
      scenesResolved,
      (scene) => generateOne(scene.characterRefs, scene.settingRef, scene.prompt, scene.shot),
      CONCURRENCY
    );

    const failedCount = images.filter((img) => !img).length;
    return res.status(200).json({ images, failedCount });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Unexpected server error." });
  }
}

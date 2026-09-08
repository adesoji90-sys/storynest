// POST /api/generate-illustrations
// Body: {
//   sessionId,   // scopes storage paths to this one book — see below
//   scenes: [ { prompt, shot, characters: [{label, base64}|{label,url}], setting?: {label, base64}|{label,url} } ]
// }
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
// Every generated illustration is uploaded to Storage and returned as a
// signed URL, NOT as base64 in the response — sessionStorage on the client
// has a hard quota (typically 5-10MB per origin), and a handful of full
// illustration images as base64 blows well past that. This was a real,
// observed bug: a 5-page book's worth of embedded base64 images threw
// "Setting the value of 'storynest_draft' exceeded the quota" the first
// time this pipeline actually ran end-to-end against real image
// generation. URLs are tiny strings; the images themselves belong in
// Storage, same as every other generated image in this app.
//
// gpt-image-1.5's edit endpoint accepts multiple input images via repeated
// `image[]` fields — check OpenAI's current docs before deploying, since
// multi-image editing support has changed across API versions.
//
// TIMEOUT WARNING: see the README ("Premium tier setup") — many sequential
// image generations will not fit inside Vercel Hobby's function duration
// limit. This route batches requests concurrently to help, but a production
// version should move to a background job + polling.

import { createClient } from "@supabase/supabase-js";
import { STYLE_GUIDE } from "@/lib/imageStyle";
import { IMAGE_MODEL, IMAGE_QUALITY } from "@/lib/imageConfig";
import { fetchOpenAIWithRetry } from "@/lib/openaiFetch";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// A signed URL, not a permanent public one — these can depict a real
// child's likeness (Premium) or a specific generated scene tied to one
// family's book, so the bucket itself is private (see supabase/schema.sql).
//
// 30 days, not indefinite: there's no technical ceiling on Supabase's
// signed-URL expiry (people use these for years), but unlike
// story-pdf-url.js (which checks the requesting user actually owns that
// story before issuing a link), THIS url carries no ownership check at
// all — anyone holding the link can open it until it expires. A longer
// expiry directly widens that exposure window if a URL ever leaks
// (browser history, a shared screenshot, etc.), which matters more here
// than in a generic app since these can be a real child's likeness. 30
// days comfortably covers a parent who generates a book and comes back
// to buy it weeks later, without leaving the door open indefinitely.
const SIGNED_URL_TTL_SECONDS = 60 * 60 * 24 * 30;

// 280s, not 60s — 60 is the standard Vercel Hobby ceiling, but that's not
// enough headroom at OpenAI's Tier 1 image rate limit (5 images/minute —
// confirmed via real account testing). Vercel's Fluid Compute feature
// raises the duration ceiling to up to 300s, even on Hobby, and at 5
// images/minute a ~280s window has capacity for ~23 images — enough for
// every book size this app generates, including the largest Premium book.
// REQUIRES Fluid Compute to be enabled on the Vercel project (Project →
// Settings → Functions) — without it, Vercel rejects any maxDuration over
// 60 on Hobby at build time. See README "OpenAI rate limits" section.
export const config = {
  maxDuration: 280,
};

// Reduced from 3 — a real, observed rate-limit error ("Rate limit reached
// for gpt-image-1.5") showed up when several illustrations generated
// concurrently on a lower-tier OpenAI account. Sequential generation is
// slower but far more likely to actually succeed; raise this back up once
// your OpenAI account's rate limit tier is confirmed to handle it (check
// platform.openai.com → Settings → Limits).
const CONCURRENCY = 1;

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
  // A genuinely different instruction, not just more emphatic wording of
  // the same one: the previous version asked the model to "illustrate a
  // scene featuring this character," which invites redesigning them fresh
  // each time, guided loosely by the reference. This version reframes it
  // as a PLACEMENT task — the character is already fully designed in the
  // reference, and the model's only job is to place that exact character
  // into a new scene, not redraw them. This is the practical middle ground
  // between two real alternatives that were weighed here: true pixel-level
  // compositing (cut the character out of their reference image, paste
  // them onto the setting) would guarantee identical pixels every time,
  // but locks every scene into one of the 6 fixed static poses with no
  // ability to show a character reaching for something, sitting, or
  // interacting with another character in a way the pose library doesn't
  // cover — a real, meaningful loss of narrative flexibility, not a small
  // one. Reframing the prompt as placement-not-redesign keeps full
  // flexibility while pushing the model toward preserving the reference
  // more literally. This is still best-effort, not a guarantee — there is
  // no fully reliable way to force pixel-identical output from this class
  // of model without either the fixed-pose compositing tradeoff above or a
  // fine-tuned/LoRA model, neither of which this app builds. If this
  // reframing doesn't meaningfully reduce drift once tested against a real
  // generation, the fixed-pose compositing approach is the next real
  // option — and would need to be a deliberate choice, not a default.
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
    `This is a character-placement task, not a redesign. ${castLine ? `${castLine.charAt(0).toUpperCase()}${castLine.slice(1)} ${characterRefs.length > 1 ? "are" : "is"} already fully designed exactly as shown in the reference image(s)` : "The reference image(s) already show exactly how each character must look"} — do not redesign, reinterpret, or alter their face, hairstyle, outfit, or outfit colors in any way. Your only job is to place that exact character, unchanged, into the scene described below, adding only the lighting, shadow, and perspective needed to integrate them naturally with the setting.
    Scene: ${prompt}
    ${settingInstruction}
    ${shotInstruction}
    Match the same style across all characters and the background: ${STYLE_GUIDE}.`
  );
  form.append("size", "1024x1024");

  const apiRes = await fetchOpenAIWithRetry("https://api.openai.com/v1/images/edits", {
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

async function uploadAndSign(sessionId, index, base64) {
  if (!base64) return null;
  const path = `${sessionId}_page_${index}.png`;
  const { error: uploadError } = await supabaseAdmin.storage
    .from("story-pages")
    .upload(path, Buffer.from(base64, "base64"), { contentType: "image/png", upsert: true });
  if (uploadError) {
    console.error("Story-page storage upload error:", uploadError);
    return null;
  }
  const { data, error: signError } = await supabaseAdmin.storage
    .from("story-pages")
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
  if (signError || !data) {
    console.error("Story-page signed URL error:", signError);
    return null;
  }
  return data.signedUrl;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { sessionId, scenes } = req.body || {};
  if (!sessionId) {
    return res.status(400).json({ error: "Missing sessionId." });
  }
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

    const base64Images = await runInBatches(
      scenesResolved,
      (scene) => generateOne(scene.characterRefs, scene.settingRef, scene.prompt, scene.shot),
      CONCURRENCY
    );

    const images = await Promise.all(
      base64Images.map((b64, i) => uploadAndSign(sessionId, i, b64))
    );

    const failedCount = images.filter((img) => !img).length;
    return res.status(200).json({ images, failedCount });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Unexpected server error." });
  }
}

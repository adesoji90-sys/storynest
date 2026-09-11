// POST /api/generate-custom-character
// Body: { userId, name, age, gender, ethnicity, hair, skinTone, eyeColor,
//          outfit, personality, styleId? }
//
// Replaces the old photo-upload flow entirely (see README "Premium tier:
// character generator replaces photo upload"). Generates all 6 poses via
// TEXT-TO-IMAGE from parent-supplied traits — the same technique already
// used for the 30 library characters (get-or-generate-character.js /
// lib/generateLibraryCharacterPose.js), just parent-authored instead of
// pre-written by us, and saved PRIVATELY to this account instead of
// shared publicly.
//
// Requires a real userId — a character scoped to "creator's account
// only" has nowhere to live without one. This is what makes Premium tier
// require login now, unlike before.

import { createClient } from "@supabase/supabase-js";
import { getStyle } from "@/lib/imageStyle";
import { POSES } from "@/lib/characterPoses";
import { IMAGE_MODEL, IMAGE_QUALITY } from "@/lib/imageConfig";
import { fetchOpenAIWithRetry } from "@/lib/openaiFetch";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Reduced from 3 for the same reason as every other batched image route
// in this app — see lib/openaiFetch.js and the README section on OpenAI
// rate limits. Sequential generation is slower but far more likely to
// actually succeed on a lower-tier OpenAI account.
const CONCURRENCY = 1;

// 280s — same reasoning as generate-illustrations.js: requires Fluid
// Compute enabled on the Vercel project.
export const config = {
  maxDuration: 280,
};

// Signed, not public — see the bucket definition in schema.sql for why.
// 90 days is generous for a character meant to be reused across many
// future books, unlike the 30-day expiry on per-book story-page images
// (which only need to survive one checkout).
const SIGNED_URL_TTL_SECONDS = 60 * 60 * 24 * 90;

function buildTraitDescription({ hair, skinTone, eyeColor, outfit, personality }) {
  const parts = [];
  if (skinTone) parts.push(`${skinTone} skin`);
  if (hair) parts.push(`${hair} hair`);
  if (eyeColor) parts.push(`${eyeColor} eyes`);
  if (outfit) parts.push(`wearing ${outfit}`);
  if (personality) parts.push(`a ${personality} personality`);
  return parts.join(", ");
}

async function generatePoseImage(prompt) {
  const apiRes = await fetchOpenAIWithRetry("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: IMAGE_MODEL,
      quality: IMAGE_QUALITY,
      prompt,
      size: "1024x1536", // portrait — see lib/characterPoses.js for why
    }),
  });
  if (!apiRes.ok) {
    console.error("Image API error:", await apiRes.text());
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

  const {
    userId,
    name,
    age,
    gender = "female",
    ethnicity,
    hair,
    skinTone,
    eyeColor,
    outfit,
    personality,
    styleId = "painterly",
  } = req.body || {};

  if (!userId) {
    return res.status(401).json({ error: "You need to be signed in to create a character." });
  }
  if (!name || !ethnicity) {
    return res.status(400).json({ error: "name and ethnicity are required." });
  }

  const style = getStyle(styleId);
  const traits = buildTraitDescription({ hair, skinTone, eyeColor, outfit, personality });
  const baseDescription = `a ${age ? `${age}-year-old ` : ""}${ethnicity} ${
    gender === "male" ? "boy" : "girl"
  } named ${name}${traits ? `, with ${traits}` : ""}`;

  try {
    // A real database row first, so poses have somewhere to attach to —
    // if pose generation partially fails below, the character itself
    // still exists and failed poses can be retried against it later,
    // rather than losing everything on one bad pose.
    const { data: character, error: insertError } = await supabaseAdmin
      .from("custom_characters")
      .insert({
        user_id: userId,
        name,
        age: age || null,
        gender,
        ethnicity,
        description: traits || null,
      })
      .select()
      .single();

    if (insertError || !character) {
      console.error("Supabase custom_characters insert error:", insertError);
      return res.status(502).json({ error: "Couldn't save the new character." });
    }

    const poseResults = await runInBatches(
      POSES,
      (pose) => generatePoseImage(`A ${style.guide} of ${baseDescription}. Now show them ${pose.prompt}.`),
      CONCURRENCY
    );

    const poses = {};
    const failedPoses = [];

    for (let i = 0; i < POSES.length; i++) {
      const pose = POSES[i];
      const base64 = poseResults[i];
      if (!base64) {
        failedPoses.push(pose.id);
        continue;
      }
      const fileName = `${character.id}_${pose.id}.png`;
      const { error: uploadError } = await supabaseAdmin.storage
        .from("custom-characters")
        .upload(fileName, Buffer.from(base64, "base64"), { contentType: "image/png", upsert: true });
      if (uploadError) {
        console.error("Supabase storage upload error:", uploadError);
        failedPoses.push(pose.id);
        continue;
      }
      const { data: signedData, error: signError } = await supabaseAdmin.storage
        .from("custom-characters")
        .createSignedUrl(fileName, SIGNED_URL_TTL_SECONDS);
      if (signError || !signedData) {
        console.error("Signed URL error:", signError);
        failedPoses.push(pose.id);
        continue;
      }
      const imageUrl = signedData.signedUrl;
      poses[pose.id] = { url: imageUrl };

      await supabaseAdmin.from("custom_character_poses").upsert({
        custom_character_id: character.id,
        pose_id: pose.id,
        style_id: style.id,
        image_url: imageUrl,
        updated_at: new Date().toISOString(),
      });
    }

    return res.status(200).json({
      customCharacterId: character.id,
      name: character.name,
      poses,
      failedPoses,
      styleId: style.id,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Unexpected server error." });
  }
}

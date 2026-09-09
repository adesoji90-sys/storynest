// Core generation logic for one (library character, pose, style) triple —
// shared between /api/get-or-generate-character.js (single pose,
// cache-first) and /api/admin/regenerate-characters.js (bulk, always
// force-regenerates). Extracted specifically so both call sites stay
// identical instead of two copies of the same OpenAI call drifting apart
// over time.
//
// Style is now part of the cache key, not just the prompt — the same
// character in the same pose needs to exist separately per style (a
// "painterly Adaeze, happy" and a "3D Adaeze, happy" are different cached
// images, not the same one re-styled). Existing rows predate this and have
// no style_id value; the schema defaults that column to 'painterly' on
// migration, which is correct — every image generated before this change
// was, in fact, painterly, since it was the only style that existed.

import { createClient } from "@supabase/supabase-js";
import { characters } from "@/data/characters";
import { getStyle } from "@/lib/imageStyle";
import { getPose } from "@/lib/characterPoses";
import { IMAGE_MODEL, IMAGE_QUALITY } from "@/lib/imageConfig";
import { fetchOpenAIWithRetry } from "@/lib/openaiFetch";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Returns { ok: true, imageUrl, cached } on success, or { ok: false, error }
// on failure — never throws, so a caller processing many of these in a
// loop (the bulk admin route) can keep going past one failure.
export async function getOrGenerateLibraryCharacterPose(characterId, poseId, force, styleId = "painterly") {
  const character = characters.find((c) => c.id === characterId);
  if (!character) {
    return { ok: false, error: "Unknown character id." };
  }
  const pose = getPose(poseId);
  const style = getStyle(styleId);

  try {
    if (!force) {
      const { data: existing } = await supabaseAdmin
        .from("library_character_poses")
        .select("image_url")
        .eq("character_id", characterId)
        .eq("pose_id", pose.id)
        .eq("style_id", style.id)
        .maybeSingle();

      if (existing?.image_url) {
        return { ok: true, imageUrl: existing.image_url, cached: true, poseId: pose.id, styleId: style.id };
      }
    }

    const prompt = `A ${style.guide} of a ${character.age}-year-old ${character.ethnicity}
${character.gender === "female" ? "girl" : "boy"} named ${character.name}.
${character.description} Now show them ${pose.prompt}.`;

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
        // Portrait, not square — see the matching comment in
        // generate-character-image.js for why. Applies to isolated
        // character poses only; generate-illustrations.js's full scenes
        // stay square.
        size: "1024x1536",
      }),
    });

    if (!apiRes.ok) {
      const errText = await apiRes.text();
      console.error("Image API error:", errText);
      return { ok: false, error: "Character generation failed upstream." };
    }

    const data = await apiRes.json();
    const generatedBase64 = data?.data?.[0]?.b64_json;
    if (!generatedBase64) {
      return { ok: false, error: "No image returned." };
    }

    // Style is now part of the storage filename too, since the same
    // character+pose exists once per style, not once total.
    const fileName = `${characterId}_${pose.id}_${style.id}.png`;
    const { error: uploadError } = await supabaseAdmin.storage
      .from("library-characters")
      .upload(fileName, Buffer.from(generatedBase64, "base64"), {
        contentType: "image/png",
        upsert: true,
      });

    if (uploadError) {
      console.error("Supabase storage upload error:", uploadError);
      return { ok: false, error: "Couldn't save the generated character." };
    }

    const { data: urlData } = supabaseAdmin.storage
      .from("library-characters")
      .getPublicUrl(fileName);
    const imageUrl = urlData?.publicUrl;

    await supabaseAdmin.from("library_character_poses").upsert({
      character_id: characterId,
      pose_id: pose.id,
      style_id: style.id,
      image_url: imageUrl,
      updated_at: new Date().toISOString(),
    });

    return { ok: true, imageUrl, cached: false, poseId: pose.id, styleId: style.id };
  } catch (err) {
    console.error(err);
    return { ok: false, error: "Unexpected server error." };
  }
}

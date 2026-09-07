// POST /api/get-or-generate-character
// Body: { characterId, poseId? }  (poseId defaults to "neutral")
//
// Each (character, pose) pair is generated exactly ONCE, ever, and cached —
// see lib/characterPoses.js for the fixed pose set. A story never triggers a
// new generation for a library character; premium-builder.js SELECTS the
// pose that fits each scene and calls this route, which returns the cached
// image immediately once every pose has been generated at least once.

import { createClient } from "@supabase/supabase-js";
import { characters } from "@/data/characters";
import { STYLE_GUIDE } from "@/lib/imageStyle";
import { getPose } from "@/lib/characterPoses";
import { IMAGE_MODEL, IMAGE_QUALITY } from "@/lib/imageConfig";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { characterId, poseId = "neutral", force = false } = req.body || {};
  const character = characters.find((c) => c.id === characterId);
  if (!character) {
    return res.status(400).json({ error: "Unknown character id." });
  }
  const pose = getPose(poseId);

  try {
    if (!force) {
      const { data: existing } = await supabaseAdmin
        .from("library_character_poses")
        .select("image_url")
        .eq("character_id", characterId)
        .eq("pose_id", pose.id)
        .maybeSingle();

      if (existing?.image_url) {
        return res.status(200).json({ imageUrl: existing.image_url, cached: true, poseId: pose.id });
      }
    }

    const prompt = `A ${STYLE_GUIDE} of a ${character.age}-year-old ${character.ethnicity}
${character.gender === "female" ? "girl" : "boy"} named ${character.name}.
${character.description} Now show them ${pose.prompt}.`;

    const apiRes = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: IMAGE_MODEL,
        quality: IMAGE_QUALITY,
        prompt,
        size: "1024x1024",
      }),
    });

    if (!apiRes.ok) {
      const errText = await apiRes.text();
      console.error("Image API error:", errText);
      return res.status(502).json({ error: "Character generation failed upstream." });
    }

    const data = await apiRes.json();
    const generatedBase64 = data?.data?.[0]?.b64_json;
    if (!generatedBase64) {
      return res.status(502).json({ error: "No image returned." });
    }

    const fileName = `${characterId}_${pose.id}.png`;
    const { error: uploadError } = await supabaseAdmin.storage
      .from("library-characters")
      .upload(fileName, Buffer.from(generatedBase64, "base64"), {
        contentType: "image/png",
        upsert: true,
      });

    if (uploadError) {
      console.error("Supabase storage upload error:", uploadError);
      return res.status(502).json({ error: "Couldn't save the generated character." });
    }

    const { data: urlData } = supabaseAdmin.storage
      .from("library-characters")
      .getPublicUrl(fileName);
    const imageUrl = urlData?.publicUrl;

    await supabaseAdmin.from("library_character_poses").upsert({
      character_id: characterId,
      pose_id: pose.id,
      image_url: imageUrl,
      updated_at: new Date().toISOString(),
    });

    return res.status(200).json({ imageUrl, cached: false, poseId: pose.id });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Unexpected server error." });
  }
}

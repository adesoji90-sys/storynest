// POST /api/generate-location-background
// Body: { customCharacterId, locationId, description, styleId? }
// (styleId defaults to "painterly" — see lib/imageStyle.js)
//
// Style is NOT part of the cache key here, unlike library character
// poses — this cache is already scoped per-book (via customCharacterId),
// and one book only ever uses one style throughout, so there's nothing
// extra to key by. Style just needs to be threaded into the prompt so the
// background matches whatever style the rest of the book uses.
//
// A recurring setting within one story (the market, her bedroom, the school
// playground) gets its background generated exactly ONCE, the first time
// any page needs it, keyed to that story's custom character. Every later
// page set at the same location reuses the identical cached image as a
// reference — the same principle as character pose caching, applied to
// environments, so a market on page 3 is recognizably the same market on
// page 9.
//
// Scoped per-story (via customCharacterId), not shared globally like the
// 30 library characters — a "market" in one family's book has no reason to
// look like the "market" in another family's book.

import { createClient } from "@supabase/supabase-js";
import { getStyle } from "@/lib/imageStyle";
import { IMAGE_MODEL, IMAGE_QUALITY } from "@/lib/imageConfig";
import { fetchOpenAIWithRetry } from "@/lib/openaiFetch";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Default Vercel duration is too short once rate-limit retries are
// possible (see lib/openaiFetch.js).
// 90s — see the matching comment in get-or-generate-character.js.
export const config = {
  maxDuration: 90,
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { customCharacterId, locationId, description, styleId = "painterly" } = req.body || {};
  if (!customCharacterId || !locationId || !description) {
    return res.status(400).json({ error: "customCharacterId, locationId, and description are required." });
  }
  const style = getStyle(styleId);

  try {
    const { data: existing } = await supabaseAdmin
      .from("story_locations")
      .select("image_url")
      .eq("custom_character_id", customCharacterId)
      .eq("location_id", locationId)
      .maybeSingle();

    if (existing?.image_url) {
      return res.status(200).json({ imageUrl: existing.image_url, cached: true });
    }

    const prompt = `A ${style.guide} of this setting, as a background/environment
plate with NO people or characters in it: ${description}
Wide, detailed environment suitable for reuse as a consistent backdrop
across multiple illustrations of the same place.`;

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
        size: "1536x1024",
      }),
    });

    if (!apiRes.ok) {
      console.error("Image API error:", await apiRes.text());
      return res.status(502).json({ error: "Background generation failed upstream." });
    }

    const data = await apiRes.json();
    const generatedBase64 = data?.data?.[0]?.b64_json;
    if (!generatedBase64) {
      return res.status(502).json({ error: "No image returned." });
    }

    const fileName = `${customCharacterId}_${locationId}.png`;
    const { error: uploadError } = await supabaseAdmin.storage
      .from("story-settings")
      .upload(fileName, Buffer.from(generatedBase64, "base64"), {
        contentType: "image/png",
        upsert: true,
      });
    if (uploadError) {
      console.error("Supabase storage upload error:", uploadError);
      return res.status(502).json({ error: "Couldn't save the generated background." });
    }

    const { data: urlData } = supabaseAdmin.storage.from("story-settings").getPublicUrl(fileName);
    const imageUrl = urlData?.publicUrl;

    await supabaseAdmin.from("story_locations").upsert({
      custom_character_id: customCharacterId,
      location_id: locationId,
      image_url: imageUrl,
      updated_at: new Date().toISOString(),
    });

    return res.status(200).json({ imageUrl, cached: false });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Unexpected server error." });
  }
}

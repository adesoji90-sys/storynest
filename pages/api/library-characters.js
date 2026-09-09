// GET /api/library-characters?style=painterly
// Returns { [characterId]: imageUrl } using each character's "neutral"
// pose in the requested style (defaults to "painterly") — this is what
// the character browser, story builder, and landing page use for a quick
// portrait. Other poses (see lib/characterPoses.js) are resolved on
// demand per story scene via /api/get-or-generate-character, not fetched
// in bulk here.
//
// The style filter is required now, not optional in practice — without
// it, once a character has been generated in more than one style, this
// query would match multiple rows per character_id and the .forEach
// below would silently overwrite the map entry with whichever row
// happened to come last, meaning the same page could show a different
// style on every reload depending on query ordering. Defaulting the
// query param to "painterly" keeps every existing caller (which predates
// the style-choice feature and doesn't pass this param) working exactly
// as before.

import { createClient } from "@supabase/supabase-js";
import { getStyle } from "@/lib/imageStyle";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const style = getStyle(req.query.style);

  try {
    const { data, error } = await supabaseAdmin
      .from("library_character_poses")
      .select("character_id, image_url")
      .eq("pose_id", "neutral")
      .eq("style_id", style.id);

    if (error) {
      console.error(error);
      return res.status(200).json({}); // fail soft — placeholders are fine
    }

    const map = {};
    (data || []).forEach((row) => {
      if (row.image_url) map[row.character_id] = row.image_url;
    });
    return res.status(200).json(map);
  } catch (err) {
    console.error(err);
    return res.status(200).json({});
  }
}

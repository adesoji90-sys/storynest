// GET /api/library-characters
// Returns { [characterId]: imageUrl } using each character's "neutral" pose
// — this is what the character browser, story builder, and landing page use
// for a quick portrait. Other poses (see lib/characterPoses.js) are
// resolved on demand per story scene via /api/get-or-generate-character,
// not fetched in bulk here.

import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { data, error } = await supabaseAdmin
      .from("library_character_poses")
      .select("character_id, image_url")
      .eq("pose_id", "neutral");

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

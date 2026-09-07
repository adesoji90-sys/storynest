// POST /api/story-pdf-url
// Body: { storyId }, header: Authorization: Bearer <supabase access token>
//
// The story-pdfs Storage bucket is private (see supabase/schema.sql) —
// this is the only way to get a working download link, and it checks
// ownership first. Never skip the ownership check just because the bucket
// is already private; a signed URL from the service role key would work
// for anyone who guessed a valid storyId otherwise.

import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: "Missing auth token." });
  }

  const { storyId } = req.body || {};
  if (!storyId) {
    return res.status(400).json({ error: "Missing storyId." });
  }

  try {
    const {
      data: { user },
      error: userError,
    } = await supabaseAdmin.auth.getUser(token);
    if (userError || !user) {
      return res.status(401).json({ error: "Invalid or expired session." });
    }

    const { data: story, error: storyError } = await supabaseAdmin
      .from("stories")
      .select("user_id, pdf_path")
      .eq("id", storyId)
      .maybeSingle();

    if (storyError || !story) {
      return res.status(404).json({ error: "Story not found." });
    }
    if (story.user_id !== user.id) {
      return res.status(403).json({ error: "This story doesn't belong to you." });
    }
    if (!story.pdf_path) {
      return res.status(404).json({ error: "No PDF saved for this story." });
    }

    const { data: signed, error: signError } = await supabaseAdmin.storage
      .from("story-pdfs")
      .createSignedUrl(story.pdf_path, 60 * 10); // 10 minutes

    if (signError || !signed) {
      console.error("Signed URL error:", signError);
      return res.status(502).json({ error: "Couldn't generate a download link." });
    }

    return res.status(200).json({ url: signed.signedUrl });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Unexpected server error." });
  }
}

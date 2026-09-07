// POST /api/redeem-subscription-story
// Lets an actively-subscribed parent get a Basic-tier story without a
// Paystack charge. The subscription status check happens here, server-side,
// against the profiles table that /api/verify-subscription and
// /api/paystack-webhook keep in sync — never trust the client's own belief
// that it's subscribed (checkout.js's `isSubscribed` state is only used to
// decide which button to show, not to authorize anything).
//
// Deliberately Basic-tier only: Premium's per-story image-generation cost
// doesn't fit a flat subscription without a fair-use cap, which isn't
// built — see checkout.js's comment on `subscriptionCovers`.

import { createClient } from "@supabase/supabase-js";
import { buildStoryPdfBuffer } from "@/lib/generateStoryPdf";
import { sendStoryEmail } from "@/lib/email";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { email, draft, tier, userId } = req.body || {};
  if (!email || !draft || !userId) {
    return res.status(400).json({ error: "Missing email, draft, or userId." });
  }
  if (tier !== "basic") {
    return res.status(400).json({ error: "Subscription redemption is Basic-tier only." });
  }

  try {
    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("subscription_status")
      .eq("id", userId)
      .maybeSingle();

    if (profileError || profile?.subscription_status !== "active") {
      return res.status(403).json({ error: "No active subscription found for this account." });
    }

    let pdfBuffer = null;
    try {
      pdfBuffer = buildStoryPdfBuffer(draft);
    } catch (pdfErr) {
      console.error("PDF generation failed:", pdfErr);
    }

    let pdfPath = null;
    if (pdfBuffer) {
      pdfPath = `sub_${userId}_${Date.now()}.pdf`;
      const { error: uploadError } = await supabaseAdmin.storage
        .from("story-pdfs")
        .upload(pdfPath, pdfBuffer, { contentType: "application/pdf", upsert: true });
      if (uploadError) {
        console.error("PDF storage upload error:", uploadError);
        pdfPath = null;
      }
    }

    const { error: storyError } = await supabaseAdmin.from("stories").insert({
      user_id: userId,
      title: draft.title,
      tier: "basic",
      character_id: draft.characterId || null,
      template_id: draft.templateId || null,
      theme_id: draft.themeId,
      story_text: draft.story,
      pdf_path: pdfPath,
    });
    if (storyError) console.error("Supabase story insert error:", storyError);

    if (pdfBuffer) {
      try {
        await sendStoryEmail({
          to: email,
          subject: `Your StoryNest book: ${draft.title}`,
          html: `<p>Hi,</p><p>"${draft.title}" is ready — it's attached as a PDF. This one's included in your subscription.</p>`,
          attachmentBase64: pdfBuffer.toString("base64"),
          attachmentFilename: `${draft.title.replace(/\s+/g, "_")}.pdf`,
        });
      } catch (emailErr) {
        console.error("Email send failed:", emailErr);
      }
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Unexpected server error." });
  }
}

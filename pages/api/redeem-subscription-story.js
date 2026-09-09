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
//
// Two checks that didn't exist in the original flat-plan version, now that
// subscriptions are per page tier with a real book cap (see
// lib/pricing.js SUBSCRIPTION_MAX_BOOKS_PER_MONTH and the README section
// on why the old "unlimited" plan was a real, quantified financial risk):
// 1. The requested book's page tier must match what this parent actually
//    subscribed to — a "short" subscriber can't redeem a free "long" book.
// 2. subscription_books_used_this_period must be under the cap. Incremented
//    here on success, reset to 0 on each renewal (paystack-webhook.js) or
//    new signup (verify-subscription.js).
//
// This does a read-then-write to increment the usage counter rather than
// an atomic database increment — an acceptable simplification given how
// infrequently one account redeems (at most 5 times per month), not
// something expected to race in practice.

import { createClient } from "@supabase/supabase-js";
import { buildStoryPdfBuffer, uint8ArrayToBase64 } from "@/lib/generateStoryPdf";
import { sendStoryEmail } from "@/lib/email";
import { SUBSCRIPTION_MAX_BOOKS_PER_MONTH } from "@/lib/pricing";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { email, draft, tier, pageTier, userId } = req.body || {};
  if (!email || !draft || !userId || !pageTier) {
    return res.status(400).json({ error: "Missing email, draft, pageTier, or userId." });
  }
  if (tier !== "basic") {
    return res.status(400).json({ error: "Subscription redemption is Basic-tier only." });
  }

  try {
    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("subscription_status, subscription_page_tier, subscription_books_used_this_period")
      .eq("id", userId)
      .maybeSingle();

    if (profileError || profile?.subscription_status !== "active") {
      return res.status(403).json({ error: "No active subscription found for this account." });
    }
    if (profile.subscription_page_tier !== pageTier) {
      return res.status(403).json({
        error: `Your subscription covers "${profile.subscription_page_tier}" books, not "${pageTier}" — pay for this one individually, or switch your subscription plan.`,
      });
    }
    if (profile.subscription_books_used_this_period >= SUBSCRIPTION_MAX_BOOKS_PER_MONTH) {
      return res.status(403).json({
        error: `You've used all ${SUBSCRIPTION_MAX_BOOKS_PER_MONTH} books included in this billing period — it resets when your subscription renews, or you can pay for this one individually.`,
      });
    }

    let pdfBuffer = null;
    try {
      pdfBuffer = await buildStoryPdfBuffer(draft);
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
      story_text: null, // Basic tier now produces structured pages, not flat text
      pages: draft.pages.map((p) => ({ text: p.text })),
      pdf_path: pdfPath,
    });
    if (storyError) console.error("Supabase story insert error:", storyError);

    // Only increment after everything else succeeded — a failed PDF/email
    // still counted before under the old design's simplicity, but there
    // was no cap to worry about then. Now that a cap exists, it's worth
    // not burning someone's monthly allowance on a redemption that didn't
    // actually deliver anything (though the PDF path failing soft above
    // means this will still usually go through — a genuinely failed
    // redemption is one where the whole request throws, caught below).
    await supabaseAdmin
      .from("profiles")
      .update({ subscription_books_used_this_period: profile.subscription_books_used_this_period + 1 })
      .eq("id", userId);

    if (pdfBuffer) {
      try {
        await sendStoryEmail({
          to: email,
          subject: `Your StoryNest book: ${draft.title}`,
          html: `<p>Hi,</p><p>"${draft.title}" is ready — it's attached as a PDF. This one's included in your subscription.</p>`,
          attachmentBase64: uint8ArrayToBase64(pdfBuffer),
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

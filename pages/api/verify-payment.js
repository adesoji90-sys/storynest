// POST /api/verify-payment
// Called from the checkout page right after Paystack's inline popup reports
// success. This does a server-side verify call (never trust the client-side
// callback alone), records the order, saves a persistent copy of the story
// (with a real PDF in private Storage) if the parent is logged in, and
// emails a receipt with the PDF attached. The /api/paystack-webhook route
// is the source of truth for reconciliation if this call is missed (closed
// tab, flaky network) — but does not itself send email or build the PDF,
// since it doesn't have the draft content, only the Paystack event. If a
// payment only gets confirmed via the webhook, that email currently never
// goes out; see README "Email delivery setup" for the gap this leaves.

import { createClient } from "@supabase/supabase-js";
import { buildStoryPdfBuffer, uint8ArrayToBase64 } from "@/lib/generateStoryPdf";
import { sendStoryEmail } from "@/lib/email";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY // server-only key, never exposed to the browser
);

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { reference, email, draft, tier = "basic", pageTier = "standard", userId = null } = req.body || {};
  if (!reference || !email || !draft) {
    return res.status(400).json({ error: "Missing reference, email, or draft." });
  }

  try {
    const verifyRes = await fetch(
      `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
      {
        headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` },
      }
    );
    const verifyData = await verifyRes.json();

    if (!verifyRes.ok || verifyData?.data?.status !== "success") {
      return res.status(402).json({ error: "Payment not confirmed by Paystack." });
    }

    const { error: orderError } = await supabaseAdmin.from("orders").insert({
      reference,
      email,
      user_id: userId,
      title: draft.title,
      tier,
      page_tier: pageTier,
      page_count: draft.pages ? draft.pages.length : null,
      character_id: draft.characterId || null,
      template_id: draft.templateId,
      theme_id: draft.themeId,
      story: null, // both tiers now produce structured pages, not flat text — see README
      pages: draft.pages.map((p) => ({ text: p.text })),
      amount_kobo: verifyData.data.amount,
      status: "paid",
    });

    if (orderError) {
      console.error("Supabase order insert error:", orderError);
      // Payment succeeded even if this write failed — don't block the
      // parent's download over it, but log loudly so it can be reconciled.
    }

    // Build the PDF once, server-side, and reuse it for both storage and
    // the email attachment — this is the same layout success.js's download
    // button produces (see lib/generateStoryPdf.js).
    let pdfBuffer = null;
    try {
      pdfBuffer = await buildStoryPdfBuffer(draft);
    } catch (pdfErr) {
      console.error("PDF generation failed:", pdfErr);
      // Continue without a PDF rather than failing the whole request — the
      // parent can still use the client-side download button on /success.
    }

    let pdfPath = null;
    if (pdfBuffer) {
      pdfPath = `${reference}.pdf`;
      const { error: uploadError } = await supabaseAdmin.storage
        .from("story-pdfs")
        .upload(pdfPath, pdfBuffer, { contentType: "application/pdf", upsert: true });
      if (uploadError) {
        console.error("PDF storage upload error:", uploadError);
        pdfPath = null;
      }
    }

    // Only logged-in parents get a persistent library entry — guest
    // checkout still works (and still gets the email + download button),
    // it just won't show up under "My Library" without an account.
    if (userId) {
      const { error: storyError } = await supabaseAdmin.from("stories").insert({
        user_id: userId,
        title: draft.title,
        tier,
        character_id: draft.characterId || null,
        custom_character_id: draft.customCharacterId || null,
        template_id: draft.templateId || null,
        theme_id: draft.themeId,
        story_text: null, // both tiers now produce structured pages, not flat text
        pages: draft.pages.map((p) => ({ text: p.text })),
        pdf_path: pdfPath,
      });
      if (storyError) console.error("Supabase story insert error:", storyError);
    }

    if (pdfBuffer) {
      try {
        await sendStoryEmail({
          to: email,
          subject: `Your StoryNest book: ${draft.title}`,
          html: `<p>Hi,</p><p>"${draft.title}" is ready — it's attached as a PDF.</p><p>Thank you for using StoryNest!</p>`,
          attachmentBase64: uint8ArrayToBase64(pdfBuffer),
          attachmentFilename: `${draft.title.replace(/\s+/g, "_")}.pdf`,
        });
      } catch (emailErr) {
        console.error("Email send failed:", emailErr);
        // Payment and PDF generation already succeeded — don't fail the
        // request over email delivery. The download button still works.
      }
    }

    return res.status(200).json({ ok: true, pdfSaved: Boolean(pdfPath) });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Unexpected server error." });
  }
}

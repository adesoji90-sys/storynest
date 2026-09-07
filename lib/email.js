// Thin wrapper around the Resend API. Chosen because the brief explicitly
// named it as the upgrade path from "manual email," and its API is a
// single JSON POST with no SDK dependency needed.
//
// FROM_EMAIL must be a verified sender/domain in your Resend account —
// Resend rejects sends from unverified domains. See README "Email delivery
// setup" for the verification steps.

const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || "StoryNest <onboarding@resend.dev>";

export async function sendStoryEmail({ to, subject, html, attachmentBase64, attachmentFilename }) {
  if (!process.env.RESEND_API_KEY) {
    console.warn("RESEND_API_KEY not set — skipping email send.");
    return { skipped: true };
  }

  const body = {
    from: FROM_EMAIL,
    to: [to],
    subject,
    html,
  };

  if (attachmentBase64 && attachmentFilename) {
    body.attachments = [{ filename: attachmentFilename, content: attachmentBase64 }];
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Resend API error (${res.status}): ${errText}`);
  }

  return res.json();
}

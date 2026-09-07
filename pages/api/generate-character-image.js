// POST /api/generate-character-image
// Body: { photoBase64, mimeType, childName }
//
// Generates ALL poses for this custom character in one batch, right now, at
// upload time — never one at a time, per story, later. This is the same
// non-negotiable-consistency principle as the library characters: a
// character's appearance in every pose is fixed once and only selected
// from after that, never freshly re-synthesized mid-story.
//
// PRIVACY: the original photo is used exactly once, in-memory, to generate
// the "neutral" pose — then every other pose is derived from that generated
// cartoon (not the photo), and the photo itself is never written to disk,
// never sent to Supabase, and is out of scope the moment this request
// returns. Only the generated cartoons are stored.

import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";
import { STYLE_GUIDE } from "@/lib/imageStyle";
import { POSES } from "@/lib/characterPoses";
import { IMAGE_MODEL, IMAGE_QUALITY } from "@/lib/imageConfig";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const CONCURRENCY = 3;

function toBlob(base64, mimeType) {
  return new Blob([Buffer.from(base64, "base64")], { type: mimeType });
}

async function editImage(imageBase64, mimeType, prompt) {
  const form = new FormData();
  form.append("model", IMAGE_MODEL);
  form.append("quality", IMAGE_QUALITY);
  form.append("image", toBlob(imageBase64, mimeType), "reference.png");
  form.append("prompt", prompt);
  form.append("size", "1024x1024");

  const apiRes = await fetch("https://api.openai.com/v1/images/edits", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: form,
  });
  if (!apiRes.ok) {
    console.error("Image API error:", await apiRes.text());
    return null;
  }
  const data = await apiRes.json();
  return data?.data?.[0]?.b64_json || null;
}

async function runInBatches(items, worker, concurrency) {
  const results = new Array(items.length).fill(null);
  let cursor = 0;
  async function next() {
    while (cursor < items.length) {
      const i = cursor++;
      results[i] = await worker(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, next));
  return results;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { photoBase64, mimeType = "image/png", childName } = req.body || {};
  if (!photoBase64) {
    return res.status(400).json({ error: "No photo provided." });
  }

  try {
    const neutralPose = POSES.find((p) => p.id === "neutral");
    const neutralPrompt = `Redraw this child as a warm ${STYLE_GUIDE}, ${neutralPose.prompt}, in
      the same illustration style as a StoryNest storybook.${childName ? ` The child's name is ${childName}.` : ""}`;

    // Step 1: the ONLY call that touches the original photo.
    const neutralBase64 = await editImage(photoBase64, mimeType, neutralPrompt);
    if (!neutralBase64) {
      return res.status(502).json({ error: "Character generation failed upstream." });
    }
    // The photo's base64 goes out of scope here — nothing below references
    // `photoBase64` again, and nothing is ever written to disk or Supabase.

    // Step 2: every other pose is derived from the generated cartoon, not
    // the photo — batched, generated once, cached from here on.
    const otherPoses = POSES.filter((p) => p.id !== "neutral");
    const otherResults = await runInBatches(
      otherPoses,
      (pose) =>
        editImage(
          neutralBase64,
          "image/png",
          `Using this reference character, redraw them ${pose.prompt}. Keep the same
          ${STYLE_GUIDE}, matching hairstyle, skin tone, and outfit colors as the reference.`
        ),
      CONCURRENCY
    );

    const customCharacterId = randomUUID();
    const poseBase64ById = { neutral: neutralBase64 };
    otherPoses.forEach((pose, i) => {
      poseBase64ById[pose.id] = otherResults[i]; // may be null if that pose failed
    });

    const failedPoses = otherPoses.filter((_, i) => !otherResults[i]).map((p) => p.id);

    // Persist every successful pose so a dropped connection or a later
    // reprint/re-email doesn't require re-uploading the photo (which we no
    // longer have anyway).
    const poses = {};
    await Promise.all(
      Object.entries(poseBase64ById).map(async ([poseId, base64]) => {
        if (!base64) return;
        const fileName = `${customCharacterId}_${poseId}.png`;
        const { error } = await supabaseAdmin.storage
          .from("custom-characters")
          .upload(fileName, Buffer.from(base64, "base64"), { contentType: "image/png" });
        let imageUrl = null;
        if (!error) {
          const { data } = supabaseAdmin.storage.from("custom-characters").getPublicUrl(fileName);
          imageUrl = data?.publicUrl || null;
        } else {
          console.error("Supabase storage upload error:", error);
        }
        poses[poseId] = { base64, url: imageUrl };
      })
    );

    return res.status(200).json({ customCharacterId, poses, failedPoses });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Unexpected server error." });
  }
}

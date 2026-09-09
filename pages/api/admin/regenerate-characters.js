// POST /api/admin/regenerate-characters
// Body: { characterIds: string[], poseIds?: string[], styleIds?: string[] }
// (poseIds defaults to ["neutral"], styleIds defaults to ["painterly"])
// Header: x-admin-secret: <ADMIN_SECRET>
//
// Purpose-built for exactly the situation that prompted it: a prompt fix
// (e.g., the head-cropping/framing fix in lib/characterPoses.js) does NOT
// retroactively affect characters generated before the fix, because the
// whole point of the pose-caching system is to never regenerate something
// that's already cached. This route is the deliberate escape hatch —
// force-regenerate a specific, chosen list of (character, pose) pairs with
// whatever the CURRENT prompt says, rather than the one they were
// originally generated under.
//
// Deliberately requires you to name which characters to redo, rather than
// "regenerate everything" — every regeneration is a real, billed OpenAI
// call. Pass exactly the ones you've actually seen a problem with.
//
// Runs sequentially (not concurrently) and reuses the same rate-limit
// retry logic as the rest of the app (see lib/openaiFetch.js) — this can
// take a while for a long list, which is expected, not a bug.

import { getOrGenerateLibraryCharacterPose } from "@/lib/generateLibraryCharacterPose";

export const config = {
  maxDuration: 280, // requires Fluid Compute — see README "OpenAI rate limits"
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const providedSecret = req.headers["x-admin-secret"];
  if (!process.env.ADMIN_SECRET || providedSecret !== process.env.ADMIN_SECRET) {
    return res.status(403).json({ error: "Requires a valid x-admin-secret header." });
  }

  const { characterIds, poseIds = ["neutral"], styleIds = ["painterly"] } = req.body || {};
  if (!Array.isArray(characterIds) || characterIds.length === 0) {
    return res.status(400).json({ error: "characterIds must be a non-empty array." });
  }
  if (characterIds.length * poseIds.length * styleIds.length > 40) {
    return res.status(400).json({
      error: `Too many combinations (${characterIds.length} characters × ${poseIds.length} poses × ${
        styleIds.length
      } styles = ${
        characterIds.length * poseIds.length * styleIds.length
      }) for one request — split into smaller batches to stay within Vercel's function duration.`,
    });
  }

  const results = [];
  for (const characterId of characterIds) {
    for (const poseId of poseIds) {
      for (const styleId of styleIds) {
        const result = await getOrGenerateLibraryCharacterPose(characterId, poseId, true, styleId);
        results.push({ characterId, poseId, styleId, ...result });
      }
    }
  }

  const succeeded = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok);

  return res.status(200).json({ succeeded, failedCount: failed.length, failed, results });
}

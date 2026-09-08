// POST /api/get-or-generate-character
// Body: { characterId, poseId?, force? }  (poseId defaults to "neutral")
//
// Each (character, pose) pair is generated exactly ONCE, ever, and cached —
// see lib/characterPoses.js for the fixed pose set. A story never triggers a
// new generation for a library character; premium-builder.js SELECTS the
// pose that fits each scene and calls this route, which returns the cached
// image immediately once every pose has been generated at least once.
//
// `force: true` bypasses the cache and regenerates — this is what lets an
// already-cached character be redone after a prompt fix (e.g., the
// framing/margin fix in lib/characterPoses.js didn't retroactively affect
// anyone generated before it). This is real money every time it's used, so
// it requires an admin secret — an earlier version of this route let
// `force: true` through with no check at all, meaning anyone who found
// this URL could have repeatedly forced regenerations at will. Normal,
// unforced lookups (the vast majority of calls to this route, from the
// app itself) still need no auth at all, since they only ever read cache
// or generate something that didn't exist yet.
//
// See /api/admin/regenerate-characters.js for bulk force-regeneration —
// both routes share the same generation logic via
// lib/generateLibraryCharacterPose.js.

import { getOrGenerateLibraryCharacterPose } from "@/lib/generateLibraryCharacterPose";

// Default Vercel duration is too short once rate-limit retries are
// possible (see lib/openaiFetch.js).
// 90s — raised from 30s because a single 429 retry at OpenAI's Tier 1
// image rate limit (5/minute) can require waiting most of a minute for
// the next window; 30s wasn't enough margin. Also requires Fluid Compute
// enabled on the Vercel project once combined with the other image routes
// in this app that need the full 280s — see generate-illustrations.js.
export const config = {
  maxDuration: 90,
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { characterId, poseId = "neutral", force = false } = req.body || {};

  if (force) {
    const providedSecret = req.headers["x-admin-secret"];
    if (!process.env.ADMIN_SECRET || providedSecret !== process.env.ADMIN_SECRET) {
      return res.status(403).json({ error: "force:true requires a valid x-admin-secret header." });
    }
  }

  const result = await getOrGenerateLibraryCharacterPose(characterId, poseId, force);
  if (!result.ok) {
    const status = result.error === "Unknown character id." ? 400 : 502;
    return res.status(status).json({ error: result.error });
  }
  return res.status(200).json(result);
}

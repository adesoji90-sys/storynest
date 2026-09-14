// POST /api/children/[id]/character
//
// Lets a parent customize their child's story-character appearance
// before generating a book, rather than always getting the generic
// auto-created description getOrCreateChildCharacterBible falls back
// to. This is a Family-tier feature by virtue of living inside Story
// Studio's flow (already gated by customBooksAllowed) — no separate
// entitlement check needed here specifically, since a Reader-tier
// family can't reach this screen to begin with.
//
// Upserts rather than always creating — a child gets exactly one
// CharacterBible (matching getOrCreateChildCharacterBible's own
// find-or-create logic), so calling this again just updates the
// existing one instead of creating a second, orphaned character.

import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireFamily } from "@/lib/authFamily";
import { checkCustomBooksAllowed } from "@/lib/checkCustomBooksAllowed";

const CharacterSchema = z.object({
  appearance: z.string().trim().max(500).optional(),
  hair: z.string().trim().max(100).optional(),
  skinTone: z.string().trim().max(100).optional(),
  clothing: z.string().trim().max(200).optional(),
  personality: z.string().trim().max(200).optional(),
  visualStyle: z.enum(["painterly", "watercolor", "cgi3d", "coloring"]).optional(),
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { id: childId } = req.query;
  if (typeof childId !== "string") {
    return res.status(400).json({ error: "Invalid child id." });
  }

  const auth = await requireFamily(req);
  if (!auth.ok) {
    return res.status(auth.status).json({ error: auth.error });
  }

  const entitlementCheck = await checkCustomBooksAllowed(auth.familyId);
  if (!entitlementCheck.ok) {
    return res.status(entitlementCheck.status).json({ error: entitlementCheck.error });
  }

  const child = await prisma.child.findFirst({ where: { id: childId, familyId: auth.familyId } });
  if (!child) {
    return res.status(404).json({ error: "Child not found." });
  }

  const parsed = CharacterSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message || "Invalid input." });
  }
  const fields = parsed.data;

  try {
    const age = child.dateOfBirth
      ? Math.floor((Date.now() - new Date(child.dateOfBirth).getTime()) / (365.25 * 24 * 60 * 60 * 1000))
      : null;

    const existing = await prisma.characterBible.findFirst({ where: { childId } });
    const character = existing
      ? await prisma.characterBible.update({ where: { id: existing.id }, data: fields })
      : await prisma.characterBible.create({
          data: {
            childId,
            familyId: auth.familyId,
            name: child.name,
            age,
            appearance: fields.appearance || "A cheerful, friendly child with a warm smile.",
            visualStyle: fields.visualStyle || "painterly",
            ...fields,
          },
        });

    return res.status(200).json({ character });
  } catch (err) {
    console.error("children/[id]/character error:", err);
    return res.status(500).json({ error: "Unexpected server error." });
  }
}

// GET/POST /api/characters
//
// Characters now belong to the FAMILY, not to exactly one child
// forever — a real redesign from the earlier one-character-per-child
// model, which caused a real bug: a character created for one story
// (e.g. "a pregnant woman") stayed cached and got reused, wrongly, for
// that same child's next completely different story. Now a family can
// hold several characters, optionally each associated with a specific
// child for organization, and a parent picks (or creates) one per
// story in Story Studio rather than the system silently deciding for
// them.
//
// childId stays informational/optional, not a uniqueness constraint —
// a character can be "for" a child without being the ONLY character
// that child's stories are allowed to use.

import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireFamily } from "@/lib/authFamily";
import { checkCustomBooksAllowed } from "@/lib/checkCustomBooksAllowed";

const CreateCharacterSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(80),
  childId: z.string().uuid().optional(),
  gender: z.enum(["girl", "boy", "unspecified"]).optional(),
  appearance: z.string().trim().max(500).optional(),
  hair: z.string().trim().max(100).optional(),
  skinTone: z.string().trim().max(100).optional(),
  clothing: z.string().trim().max(200).optional(),
  personality: z.string().trim().max(200).optional(),
  visualStyle: z.enum(["painterly", "watercolor", "cgi3d", "coloring"]).optional(),
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const auth = await requireFamily(req);
  if (!auth.ok) {
    return res.status(auth.status).json({ error: auth.error });
  }

  if (req.method === "GET") {
    try {
      const characters = await prisma.characterBible.findMany({
        where: { familyId: auth.familyId },
        orderBy: { createdAt: "desc" },
        include: { child: { select: { id: true, name: true } } },
      });
      return res.status(200).json({ characters });
    } catch (err) {
      console.error("characters GET error:", err);
      return res.status(500).json({ error: "Unexpected server error." });
    }
  }

  if (req.method === "POST") {
    // Character creation is gated the same as story creation — see
    // checkCustomBooksAllowed's own comment for why this and story
    // creation are the two things that stop on downgrade, while
    // illustrating/narrating already-created content doesn't.
    const entitlementCheck = await checkCustomBooksAllowed(auth.familyId);
    if (!entitlementCheck.ok) {
      return res.status(entitlementCheck.status).json({ error: entitlementCheck.error });
    }

    const parsed = CreateCharacterSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message || "Invalid input." });
    }
    const { childId, ...fields } = parsed.data;

    if (childId) {
      const child = await prisma.child.findFirst({ where: { id: childId, familyId: auth.familyId } });
      if (!child) {
        return res.status(404).json({ error: "Child not found." });
      }
    }

    try {
      const character = await prisma.characterBible.create({
        data: {
          familyId: auth.familyId,
          childId: childId || null,
          visualStyle: "painterly",
          ...fields,
        },
      });
      return res.status(201).json({ character });
    } catch (err) {
      console.error("characters POST error:", err);
      return res.status(500).json({ error: "Unexpected server error." });
    }
  }

  return res.status(405).json({ error: "Method not allowed" });
}

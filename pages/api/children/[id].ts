// PATCH /api/children/[id]
// Updates a child's editable fields, or deactivates one (active: false —
// soft delete, matching Section 2's "never delete a family's... history"
// principle; a deactivated child's past reading history/assignments
// stay intact, just hidden from the active list).
//
// SECURITY: uses updateMany with a compound (id + familyId) filter,
// not update({ where: { id } }) — the latter would succeed even for a
// child belonging to a completely different family if someone guessed
// or obtained another family's child id. updateMany against a filter
// that excludes it affects zero rows instead, which this route reports
// as 404, never leaking whether the id exists at all under another
// family.

import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireFamily } from "@/lib/authFamily";

const UpdateChildSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  dateOfBirth: z.string().date().optional().nullable(),
  readingLevel: z.string().trim().max(40).optional().nullable(),
  preferredLanguage: z.string().trim().max(20).optional(),
  interests: z.array(z.string().trim().max(40)).max(20).optional(),
  active: z.boolean().optional(),
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "PATCH") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { id } = req.query;
  if (typeof id !== "string") {
    return res.status(400).json({ error: "Invalid child id." });
  }

  const auth = await requireFamily(req);
  if (!auth.ok) {
    return res.status(auth.status).json({ error: auth.error });
  }

  const parsed = UpdateChildSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message || "Invalid input." });
  }
  if (Object.keys(parsed.data).length === 0) {
    return res.status(400).json({ error: "No fields to update." });
  }

  const { dateOfBirth, ...rest } = parsed.data;

  try {
    const result = await prisma.child.updateMany({
      where: { id, familyId: auth.familyId },
      data: {
        ...rest,
        ...(dateOfBirth !== undefined ? { dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null } : {}),
      },
    });

    if (result.count === 0) {
      return res.status(404).json({ error: "Child not found." });
    }

    const child = await prisma.child.findUnique({ where: { id } });
    return res.status(200).json({ child });
  } catch (err) {
    console.error("children update error:", err);
    return res.status(500).json({ error: "Unexpected server error." });
  }
}

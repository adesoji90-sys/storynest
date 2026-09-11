// PATCH /api/assignments/[id]
// Sets an assignment's status to REMOVED (soft, matching Section 2's
// "never delete... history" principle — unassigning keeps the record,
// and any reading progress already made, rather than deleting it).
//
// SECURITY: filters by { id, child: { familyId } } — a relation filter,
// not just { id } — so an assignment id belonging to another family's
// child can never match, the same pattern as children/[id].ts's
// updateMany, just reached through the Child relation instead of a
// direct familyId column on this table.

import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "@/lib/prisma";
import { requireFamily } from "@/lib/authFamily";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "PATCH") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { id } = req.query;
  if (typeof id !== "string") {
    return res.status(400).json({ error: "Invalid assignment id." });
  }

  const auth = await requireFamily(req);
  if (!auth.ok) {
    return res.status(auth.status).json({ error: auth.error });
  }

  try {
    const result = await prisma.bookAssignment.updateMany({
      where: { id, child: { familyId: auth.familyId } },
      data: { status: "REMOVED" },
    });
    if (result.count === 0) {
      return res.status(404).json({ error: "Assignment not found." });
    }
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("assignments PATCH error:", err);
    return res.status(500).json({ error: "Unexpected server error." });
  }
}

// GET /api/family/me
// Returns the signed-in parent's family id and its children (active
// ones by default). This is the "who am I, and who are my kids" call
// the /family page loads on mount.

import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "@/lib/prisma";
import { requireFamily } from "@/lib/authFamily";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const auth = await requireFamily(req);
  if (!auth.ok) {
    return res.status(auth.status).json({ error: auth.error });
  }

  try {
    const children = await prisma.child.findMany({
      where: { familyId: auth.familyId, active: true },
      orderBy: { createdAt: "asc" },
    });
    return res.status(200).json({ familyId: auth.familyId, children });
  } catch (err) {
    console.error("family/me error:", err);
    return res.status(500).json({ error: "Unexpected server error." });
  }
}

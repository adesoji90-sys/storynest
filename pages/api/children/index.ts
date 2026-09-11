// POST /api/children
// Creates a new Child under the authenticated caller's family. Validated
// with zod (Section 35's "schema validation" requirement) rather than
// trusting the request body directly — this is ordinary user input, not
// AI output, but the same discipline applies: never trust an unvalidated
// body, especially one that's about to be written into a child's data.
//
// Deliberately does NOT enforce a max-children plan limit yet — that
// requires the Entitlement row this family would need, which nothing in
// the app creates yet (Entitlement/Subscription wiring is Step 11 in the
// brief's own ordering, after this). Flagged here, not silently skipped.

import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireFamily } from "@/lib/authFamily";

const CreateChildSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(80),
  dateOfBirth: z.string().date().optional().nullable(),
  readingLevel: z.string().trim().max(40).optional().nullable(),
  preferredLanguage: z.string().trim().max(20).optional(),
  interests: z.array(z.string().trim().max(40)).max(20).optional(),
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const auth = await requireFamily(req);
  if (!auth.ok) {
    return res.status(auth.status).json({ error: auth.error });
  }

  const parsed = CreateChildSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message || "Invalid input." });
  }
  const { name, dateOfBirth, readingLevel, preferredLanguage, interests } = parsed.data;

  try {
    // Step 11 enforcement: a family with no Entitlement row yet (e.g.
    // signed up before the "free" plan was seeded) is treated as
    // unlimited rather than blocked — a missing entitlement is a data
    // gap to reconcile, not something that should lock a real family
    // out of adding their own children.
    const entitlement = await prisma.entitlement.findUnique({ where: { familyId: auth.familyId } });
    if (entitlement) {
      const activeChildCount = await prisma.child.count({ where: { familyId: auth.familyId, active: true } });
      if (activeChildCount >= entitlement.maxChildren) {
        return res.status(403).json({
          error: `Your plan allows up to ${entitlement.maxChildren} ${entitlement.maxChildren === 1 ? "child" : "children"}.`,
          code: "PLAN_LIMIT_REACHED",
        });
      }
    }

    const child = await prisma.child.create({
      data: {
        familyId: auth.familyId,
        name,
        dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null,
        readingLevel: readingLevel || null,
        preferredLanguage: preferredLanguage || "en",
        interests: interests || [],
      },
    });
    return res.status(201).json({ child });
  } catch (err) {
    console.error("children create error:", err);
    return res.status(500).json({ error: "Unexpected server error." });
  }
}

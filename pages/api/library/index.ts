// GET /api/library
// Lists PUBLISHED curated books only — never DRAFT/UNPUBLISHED/ARCHIVED
// ones, regardless of who's asking. Requires being signed in (any
// family member), but isn't family-scoped beyond that: curated books
// are shared library content, the same book visible to every family,
// which is the whole point of Book being a reusable asset (Section 5,
// Principle 3) rather than belonging to one family.
//
// Optional filters via query params: ageRange (a number — returns books
// whose range includes it), category, readingLevel. All are exact/range
// matches, not fuzzy search — a real search feature is a later, separate
// piece of work, not something to fold into this first browse view.

import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";
import { prisma } from "@/lib/prisma";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.SUPABASE_SERVICE_ROLE_KEY as string
);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: "Missing access token." });
  }
  const { data: userData, error: authError } = await supabaseAdmin.auth.getUser(token);
  if (authError || !userData?.user) {
    return res.status(401).json({ error: "Invalid or expired session." });
  }

  const { ageRange, category, readingLevel } = req.query;

  try {
    const books = await prisma.book.findMany({
      where: {
        type: "CURATED",
        status: "PUBLISHED",
        ...(category && typeof category === "string" ? { category } : {}),
        ...(readingLevel && typeof readingLevel === "string" ? { readingLevel } : {}),
        ...(ageRange && typeof ageRange === "string" && !isNaN(Number(ageRange))
          ? {
              AND: [
                { OR: [{ ageRangeMin: null }, { ageRangeMin: { lte: Number(ageRange) } }] },
                { OR: [{ ageRangeMax: null }, { ageRangeMax: { gte: Number(ageRange) } }] },
              ],
            }
          : {}),
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        title: true,
        subtitle: true,
        description: true,
        ageRangeMin: true,
        ageRangeMax: true,
        readingLevel: true,
        category: true,
        lesson: true,
        language: true,
        _count: { select: { pages: true } },
      },
    });
    return res.status(200).json({ books });
  } catch (err) {
    console.error("library GET error:", err);
    return res.status(500).json({ error: "Unexpected server error." });
  }
}

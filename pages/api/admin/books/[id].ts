// PATCH /api/admin/books/[id]
// Toggles a book's status between DRAFT and PUBLISHED. Deliberately the
// only thing this route does for now — editing title/pages after
// creation isn't built yet (bare-bones scope), just create and publish.

import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/authAdmin";

const UpdateBookSchema = z.object({
  status: z.enum(["DRAFT", "PUBLISHED", "UNPUBLISHED", "ARCHIVED"]),
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "PATCH") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const auth = await requireAdmin(req);
  if (!auth.ok) {
    return res.status(auth.status).json({ error: auth.error });
  }

  const { id } = req.query;
  if (typeof id !== "string") {
    return res.status(400).json({ error: "Invalid book id." });
  }

  const parsed = UpdateBookSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message || "Invalid input." });
  }

  try {
    const book = await prisma.book.update({
      where: { id },
      data: { status: parsed.data.status },
    });
    return res.status(200).json({ book });
  } catch (err: any) {
    if (err?.code === "P2025") {
      return res.status(404).json({ error: "Book not found." });
    }
    console.error("admin/books PATCH error:", err);
    return res.status(500).json({ error: "Unexpected server error." });
  }
}

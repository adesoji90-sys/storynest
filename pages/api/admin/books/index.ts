// GET/POST /api/admin/books
//
// Bare-bones admin content creation — deliberately text-only for now.
// No illustration generation here at all: Section 14 is explicit that
// image generation is expensive and belongs strictly AFTER a story is
// approved, and building that pipeline properly (character consistency,
// the actual AI calls, cost tracking) is real, separate work, not
// something to fold into a first admin form. An admin can type a
// book's pages directly; illustrating them is a later, dedicated pass
// that will reuse Story Studio's pipeline once that exists.
//
// Every book created here is CURATED (familyId: null, shared across all
// families) — this endpoint has no path to creating a CUSTOM (one
// family's personalized) book, which only ever gets created through the
// parent-facing Story Studio flow, not the admin panel.

import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/authAdmin";

const CreateBookSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(200),
  subtitle: z.string().trim().max(200).optional(),
  description: z.string().trim().max(2000).optional(),
  ageRangeMin: z.number().int().min(0).max(18).optional(),
  ageRangeMax: z.number().int().min(0).max(18).optional(),
  readingLevel: z.string().trim().max(40).optional(),
  language: z.string().trim().max(20).optional(),
  category: z.string().trim().max(60).optional(),
  lesson: z.string().trim().max(200).optional(),
  pages: z
    .array(z.object({ text: z.string().trim().min(1).max(4000) }))
    .min(1, "At least one page is required")
    .max(60),
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const auth = await requireAdmin(req);
  if (!auth.ok) {
    return res.status(auth.status).json({ error: auth.error });
  }

  if (req.method === "GET") {
    try {
      const books = await prisma.book.findMany({
        where: { type: "CURATED" },
        orderBy: { createdAt: "desc" },
        include: { _count: { select: { pages: true } } },
      });
      return res.status(200).json({ books });
    } catch (err) {
      console.error("admin/books GET error:", err);
      return res.status(500).json({ error: "Unexpected server error." });
    }
  }

  if (req.method === "POST") {
    const parsed = CreateBookSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message || "Invalid input." });
    }
    const { pages, ...bookFields } = parsed.data;

    try {
      const book = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        const created = await tx.book.create({
          data: {
            ...bookFields,
            type: "CURATED",
            status: "DRAFT",
            createdByUserId: auth.userId,
          },
        });
        await tx.page.createMany({
          data: pages.map((p, i) => ({
            bookId: created.id,
            pageNumber: i + 1,
            text: p.text,
            status: "TEXT_READY" as const,
          })),
        });
        return created;
      });
      return res.status(201).json({ book });
    } catch (err) {
      console.error("admin/books POST error:", err);
      return res.status(500).json({ error: "Unexpected server error." });
    }
  }

  return res.status(405).json({ error: "Method not allowed" });
}

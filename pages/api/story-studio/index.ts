// GET/POST /api/story-studio
//
// This is the personalized counterpart to /api/admin/books — same
// generate → review → approve shape, but tied to one specific child
// instead of published to every family, and going through the real
// Story/StoryVersion lifecycle (Section 9) instead of admin content's
// simpler create-then-publish flow.
//
// POST starts a new story: creates a CUSTOM Book (familyId set, not
// null) and its Story container together, both in DRAFT — nothing is
// generated yet, this just gives the brief somewhere to live before the
// first AI call. GET lists the family's in-progress (not yet approved)
// stories, so a parent can resume one instead of only ever starting
// fresh.

import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireFamily } from "@/lib/authFamily";

const BriefSchema = z.object({
  childId: z.string().uuid(),
  theme: z.string().trim().min(1, "Describe what the story should be about."),
  lesson: z.string().trim().max(200).optional(),
  genre: z.string().trim().max(60).optional(),
  setting: z.string().trim().max(200).optional(),
  pageCount: z.number().int().min(3).max(30).default(8),
  parentInstructions: z.string().trim().max(500).optional(),
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const auth = await requireFamily(req);
  if (!auth.ok) {
    return res.status(auth.status).json({ error: auth.error });
  }

  if (req.method === "GET") {
    try {
      const stories = await prisma.story.findMany({
        where: { familyId: auth.familyId, status: { not: "STORY_APPROVED" } },
        orderBy: { updatedAt: "desc" },
        include: {
          child: { select: { id: true, name: true } },
          book: { select: { id: true, title: true } },
          versions: { orderBy: { versionNumber: "desc" }, take: 1 },
        },
      });
      return res.status(200).json({ stories });
    } catch (err) {
      console.error("story-studio GET error:", err);
      return res.status(500).json({ error: "Unexpected server error." });
    }
  }

  if (req.method === "POST") {
    const parsed = BriefSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message || "Invalid input." });
    }
    const { childId, ...brief } = parsed.data;

    const child = await prisma.child.findFirst({ where: { id: childId, familyId: auth.familyId } });
    if (!child) {
      return res.status(404).json({ error: "Child not found." });
    }

    try {
      const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        const book = await tx.book.create({
          data: {
            title: `${child.name}'s story`, // placeholder — replaced with the AI's actual title once generated
            type: "CUSTOM",
            status: "DRAFT",
            familyId: auth.familyId,
            createdByUserId: auth.userId,
          },
        });
        const story = await tx.story.create({
          data: {
            bookId: book.id,
            familyId: auth.familyId,
            childId,
            status: "DRAFT",
            brief,
          },
        });
        return { storyId: story.id, bookId: book.id };
      });
      return res.status(201).json(result);
    } catch (err) {
      console.error("story-studio POST error:", err);
      return res.status(500).json({ error: "Unexpected server error." });
    }
  }

  return res.status(405).json({ error: "Method not allowed" });
}

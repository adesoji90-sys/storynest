// POST /api/story-studio/[storyId]/approve
// Body: { title, pages: [{ text }] } — the parent's final (possibly
// edited) version, not necessarily identical to the last generated one.
//
// This is the one irreversible-feeling step in the flow, matching
// Section 13's "AI-assisted editing must NEVER automatically publish
// changes... the parent explicitly approves before illustration
// generation begins": nothing before this point has touched the real
// Page rows at all, only StoryVersion drafts.
//
// On approval: creates the real Page rows (this is what /read/[bookId]
// actually serves), records one more StoryVersion capturing exactly
// what was approved (createdByUserId set, marking it as the parent's
// final edit rather than raw AI output — Section 10's versioning
// applies to the approved state too, not just generation drafts),
// publishes the Book, and auto-creates a BookAssignment for the child
// this story was written for. A CUSTOM book only ever exists for one
// child by construction, so there's no separate "assign" step the way
// there is for curated library books shared across many children.

import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireFamily } from "@/lib/authFamily";

const ApproveSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(200),
  pages: z
    .array(z.object({ text: z.string().trim().min(1).max(4000) }))
    .min(1, "At least one page is required")
    .max(60),
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { storyId } = req.query;
  if (typeof storyId !== "string") {
    return res.status(400).json({ error: "Invalid story id." });
  }

  const auth = await requireFamily(req);
  if (!auth.ok) {
    return res.status(auth.status).json({ error: auth.error });
  }

  const parsed = ApproveSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message || "Invalid input." });
  }
  const { title, pages } = parsed.data;

  const story = await prisma.story.findFirst({ where: { id: storyId, familyId: auth.familyId } });
  if (!story) {
    return res.status(404).json({ error: "Story not found." });
  }
  if (story.status === "STORY_APPROVED") {
    return res.status(409).json({ error: "This story has already been approved." });
  }

  try {
    const bookId = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const latestVersion = await tx.storyVersion.findFirst({
        where: { storyId },
        orderBy: { versionNumber: "desc" },
        select: { versionNumber: true },
      });
      await tx.storyVersion.create({
        data: {
          storyId,
          versionNumber: (latestVersion?.versionNumber ?? 0) + 1,
          title,
          pagesJson: pages,
          createdByUserId: auth.userId,
        },
      });

      await tx.page.createMany({
        data: pages.map((p, i) => ({
          bookId: story.bookId,
          pageNumber: i + 1,
          text: p.text,
          status: "TEXT_READY" as const,
        })),
      });

      await tx.book.update({ where: { id: story.bookId }, data: { title, status: "PUBLISHED" } });
      await tx.story.update({ where: { id: storyId }, data: { status: "STORY_APPROVED" } });

      await tx.bookAssignment.upsert({
        where: { bookId_childId: { bookId: story.bookId, childId: story.childId as string } },
        update: { status: "ACTIVE" },
        create: { bookId: story.bookId, childId: story.childId as string, assignedByUserId: auth.userId, status: "ACTIVE" },
      });

      return story.bookId;
    });

    return res.status(200).json({ ok: true, bookId });
  } catch (err) {
    console.error("story-studio approve error:", err);
    return res.status(500).json({ error: "Unexpected server error." });
  }
}

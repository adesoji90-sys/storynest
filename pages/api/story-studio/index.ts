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
import { checkCustomBooksAllowed } from "@/lib/checkCustomBooksAllowed";

const BriefSchema = z.object({
  childId: z.string().uuid(),
  characterId: z.string().uuid().optional(), // if omitted, a default character is auto-created for the child, same as before this change
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
      const [stories, entitlement] = await Promise.all([
        prisma.story.findMany({
          where: { familyId: auth.familyId, status: { not: "STORY_APPROVED" } },
          orderBy: { updatedAt: "desc" },
          include: {
            child: { select: { id: true, name: true } },
            book: { select: { id: true, title: true } },
            versions: { orderBy: { versionNumber: "desc" }, take: 1 },
          },
        }),
        prisma.entitlement.findUnique({ where: { familyId: auth.familyId }, select: { customBooksAllowed: true } }),
      ]);
      // No entitlement row yet is treated as "allowed" — same
      // "missing entitlement means unrestricted, not blocked"
      // philosophy already used for max_children in /api/children,
      // rather than a family with a data gap being locked out of a
      // feature their actual plan may well include.
      return res.status(200).json({ stories, customBooksAllowed: entitlement?.customBooksAllowed ?? true });
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
    const { childId, characterId, ...brief } = parsed.data;

    const child = await prisma.child.findFirst({ where: { id: childId, familyId: auth.familyId } });
    if (!child) {
      return res.status(404).json({ error: "Child not found." });
    }

    // If a character was explicitly chosen, confirm it's actually this
    // family's — never trust a client-supplied id alone, same pattern
    // as every other ownership check in this codebase.
    if (characterId) {
      const character = await prisma.characterBible.findFirst({ where: { id: characterId, familyId: auth.familyId } });
      if (!character) {
        return res.status(404).json({ error: "Character not found." });
      }
    }

    // The actual enforcement point — the GET handler above also returns
    // this flag so the UI can show an upgrade prompt before a parent
    // even fills out a brief, but that's a UX nicety, not the real
    // gate. This check is what actually stops a Reader-tier family
    // from creating a custom book even if they somehow reach this
    // endpoint directly.
    const entitlementCheck = await checkCustomBooksAllowed(auth.familyId);
    if (!entitlementCheck.ok) {
      return res.status(entitlementCheck.status).json({ error: entitlementCheck.error, code: "CUSTOM_BOOKS_NOT_ALLOWED" });
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
        // Linked now, at story-creation time, rather than left for
        // illustration time to figure out — this is what lets
        // illustrate.ts check BookCharacter FIRST (same lookup order
        // admin/curated illustration already uses) instead of falling
        // back to auto-deriving one from childId, which is the old
        // behavior that caused the cover/pages mismatch bug in the
        // first place.
        if (characterId) {
          await tx.bookCharacter.create({ data: { bookId: book.id, characterId, role: "main" } });
        }
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

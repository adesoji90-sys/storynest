// Shared by every route that CREATES custom-book content: starting a
// story (/api/story-studio), regenerating its text
// (/api/story-studio/[storyId]/generate), approving/finalizing it
// (/api/story-studio/[storyId]/approve), and customizing a child's
// character (/api/children/[id]/character).
//
// Deliberately NOT applied to illustration or narration
// (/api/books/[bookId]/illustrate, /api/books/[bookId]/narrate) — those
// aren't "creating a story" or "creating a character," they're
// finishing/enriching content that was already created while the
// family was entitled to create it, and narration specifically is a
// capability of BOTH tiers regardless of custom-book access (it's how
// the Reader tier's library content gets listened to as well). A
// family that creates custom books on the Family plan, then downgrades
// to Reader, correctly loses the ability to start/regenerate/approve
// new custom stories or customize characters — but their existing
// custom books stay fully illustratable and narratable, same as the
// schema's own "never delete a family's content on downgrade"
// principle already promises for the books themselves.
//
// Missing entitlement row is treated as "allowed," same philosophy as
// every other entitlement check in this codebase (max_children,
// story-studio's own initial check) — a data gap shouldn't lock out a
// family whose actual plan may well include this.
import { prisma } from "@/lib/prisma";

export async function checkCustomBooksAllowed(
  familyId: string
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const entitlement = await prisma.entitlement.findUnique({
    where: { familyId },
    select: { customBooksAllowed: true },
  });
  if (entitlement && !entitlement.customBooksAllowed) {
    return {
      ok: false,
      status: 403,
      error: "This needs the Family plan — the library is still fully available on your current plan.",
    };
  }
  return { ok: true };
}

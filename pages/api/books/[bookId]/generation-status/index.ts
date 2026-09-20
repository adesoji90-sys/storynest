// GET /api/books/[bookId]/generation-status?jobType=NARRATION|IMAGE_GENERATION
//
// Deliberately polled by (bookId, jobType), not by a specific job id —
// the client fires the illustrate/narrate POST and needs to start
// polling for progress immediately, but that POST doesn't return a job
// id until the ENTIRE operation finishes (Vercel functions block until
// they respond; there's no way to get a job id back early from that
// same request). Polling "the latest job for this book" instead avoids
// that chicken-and-egg problem — the poll can start firing right away,
// before the job row even exists yet, and will just pick it up on a
// later attempt once the POST has created it.
import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "@/lib/prisma";
import { requireFamily } from "@/lib/authFamily";

// Matches prisma/schema.prisma's JobType enum exactly, defined locally
// rather than imported from @prisma/client — TypeScript's structural
// typing means an identical string-literal union is assignment-compatible
// with the real generated enum wherever Prisma expects it, without this
// file needing the generated package output to resolve the import at all.
type JobType = "STORY_GENERATION" | "STORY_REWRITE" | "IMAGE_GENERATION" | "IMAGE_REGENERATION" | "IMAGE_EDIT" | "NARRATION";
const VALID_JOB_TYPES: JobType[] = ["STORY_GENERATION", "STORY_REWRITE", "IMAGE_GENERATION", "IMAGE_REGENERATION", "IMAGE_EDIT", "NARRATION"];

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  const auth = await requireFamily(req);
  if (!auth.ok) {
    return res.status(auth.status).json({ error: auth.error });
  }
  const { bookId, jobType } = req.query;
  // req.query values are always plain strings — VALID_JOB_TYPES.includes
  // both validates the value AND narrows the type for Prisma's benefit,
  // which is stricter than a query param can be on its own: jobType is a
  // real enum column, not a plain string column, so Prisma's generated
  // types reject an unnarrowed string here even though the actual value
  // matches a valid member.
  if (typeof bookId !== "string" || typeof jobType !== "string" || !VALID_JOB_TYPES.includes(jobType as JobType)) {
    return res.status(400).json({ error: "bookId and a valid jobType are required." });
  }

  const job = await prisma.generationJob.findFirst({
    where: { bookId, jobType: jobType as JobType, familyId: auth.familyId },
    orderBy: { startedAt: "desc" },
  });

  if (!job) {
    return res.status(200).json({ status: "NONE" });
  }

  const progress = (job.resultJson as any)?.completed != null
    ? { completed: (job.resultJson as any).completed, total: (job.resultJson as any).total }
    : null;

  return res.status(200).json({ status: job.status, progress });
}

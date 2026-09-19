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

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  const auth = await requireFamily(req);
  if (!auth.ok) {
    return res.status(auth.status).json({ error: auth.error });
  }
  const { bookId, jobType } = req.query;
  if (typeof bookId !== "string" || typeof jobType !== "string") {
    return res.status(400).json({ error: "bookId and jobType are required." });
  }

  const job = await prisma.generationJob.findFirst({
    where: { bookId, jobType, familyId: auth.familyId },
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

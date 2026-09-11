// GET/POST /api/family/reading-mode-pin
//
// GET returns only whether a PIN exists (never the PIN or its hash) —
// used by /family to decide whether to prompt for first-time setup
// before entering Reading Mode, versus just proceeding straight in.
//
// POST sets or replaces the PIN. Deliberately only reachable from a
// parent-facing context (the /family page, before Reading Mode is
// entered) — never exposed anywhere inside Reading Mode itself, since a
// child who could set their own exit PIN would defeat the entire point
// of it existing.

import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireFamily } from "@/lib/authFamily";
import { hashPin } from "@/lib/readingModePin";

const SetPinSchema = z.object({
  pin: z.string().regex(/^\d{4}$/, "PIN must be exactly 4 digits."),
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const auth = await requireFamily(req);
  if (!auth.ok) {
    return res.status(auth.status).json({ error: auth.error });
  }

  if (req.method === "GET") {
    try {
      const family = await prisma.family.findUnique({
        where: { id: auth.familyId },
        select: { readingModePinHash: true },
      });
      return res.status(200).json({ hasPin: !!family?.readingModePinHash });
    } catch (err) {
      console.error("reading-mode-pin GET error:", err);
      return res.status(500).json({ error: "Unexpected server error." });
    }
  }

  if (req.method === "POST") {
    const parsed = SetPinSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message || "Invalid input." });
    }
    try {
      await prisma.family.update({
        where: { id: auth.familyId },
        data: {
          readingModePinHash: hashPin(parsed.data.pin),
          // Setting/replacing a PIN clears any existing lockout — a
          // parent who forgot the old PIN and reset it (through their
          // own authenticated session, the only way to reach this
          // route at all) shouldn't stay locked out because of attempts
          // against the PIN they just changed.
          readingModePinFailedAttempts: 0,
          readingModePinLockedUntil: null,
        },
      });
      return res.status(200).json({ ok: true });
    } catch (err) {
      console.error("reading-mode-pin POST error:", err);
      return res.status(500).json({ error: "Unexpected server error." });
    }
  }

  return res.status(405).json({ error: "Method not allowed" });
}

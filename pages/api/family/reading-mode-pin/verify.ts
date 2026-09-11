// POST /api/family/reading-mode-pin/verify
// Body: { pin: "1234" }
//
// This is called from INSIDE Reading Mode (the exit gate), so unlike
// every other family-scoped route, the caller here is deliberately not
// assumed to be "the parent" — it's whoever is holding the device,
// which is the entire point of requiring a PIN they'd have to actually
// know. The Supabase session itself is still the parent's the whole
// time (there's no separate child login); this PIN is the only real
// check happening at this specific moment.
//
// Lockout: 5 failed attempts locks further tries for 5 minutes. This
// exists specifically because a 4-digit PIN only has 10,000 possible
// values — without a limit, a child (or a script) could just try all of
// them. A correct attempt always resets the counter and any lock.

import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireFamily } from "@/lib/authFamily";
import { verifyPin } from "@/lib/readingModePin";

const VerifySchema = z.object({
  pin: z.string().regex(/^\d{4}$/, "PIN must be exactly 4 digits."),
});

const MAX_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 5;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const auth = await requireFamily(req);
  if (!auth.ok) {
    return res.status(auth.status).json({ error: auth.error });
  }

  const parsed = VerifySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message || "Invalid input." });
  }

  try {
    const family = await prisma.family.findUnique({
      where: { id: auth.familyId },
      select: { readingModePinHash: true, readingModePinFailedAttempts: true, readingModePinLockedUntil: true },
    });

    if (!family?.readingModePinHash) {
      return res.status(404).json({ error: "No PIN has been set up yet." });
    }

    if (family.readingModePinLockedUntil && family.readingModePinLockedUntil > new Date()) {
      const minutesLeft = Math.ceil((family.readingModePinLockedUntil.getTime() - Date.now()) / 60000);
      return res.status(429).json({
        valid: false,
        error: `Too many attempts — try again in ${minutesLeft} minute${minutesLeft === 1 ? "" : "s"}.`,
      });
    }

    const isCorrect = verifyPin(parsed.data.pin, family.readingModePinHash);

    if (isCorrect) {
      await prisma.family.update({
        where: { id: auth.familyId },
        data: { readingModePinFailedAttempts: 0, readingModePinLockedUntil: null },
      });
      return res.status(200).json({ valid: true });
    }

    const nextAttempts = family.readingModePinFailedAttempts + 1;
    const shouldLock = nextAttempts >= MAX_ATTEMPTS;
    await prisma.family.update({
      where: { id: auth.familyId },
      data: {
        readingModePinFailedAttempts: shouldLock ? 0 : nextAttempts,
        readingModePinLockedUntil: shouldLock ? new Date(Date.now() + LOCKOUT_MINUTES * 60000) : null,
      },
    });

    return res.status(200).json({
      valid: false,
      error: shouldLock
        ? `Too many attempts — try again in ${LOCKOUT_MINUTES} minutes.`
        : "Incorrect PIN.",
    });
  } catch (err) {
    console.error("reading-mode-pin verify error:", err);
    return res.status(500).json({ error: "Unexpected server error." });
  }
}

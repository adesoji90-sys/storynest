// Shared by every /api/family/* and /api/children/* route. Resolving
// "which family does this request belong to" from a verified session —
// never from a client-supplied familyId or childId alone — is exactly
// the check Section 26 requires ("A user must NEVER be able to access
// another family's private... data by manipulating an ID"). Every route
// that touches a Child or Family record calls this first and then
// additionally scopes its own query by the returned familyId, so a
// request for someone else's child can't succeed even with a guessed or
// stolen ID — the WHERE clause itself excludes it.

import type { NextApiRequest } from "next";
import { createClient } from "@supabase/supabase-js";
import { prisma } from "@/lib/prisma";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.SUPABASE_SERVICE_ROLE_KEY as string
);

export type FamilyAuthResult =
  | { ok: true; userId: string; familyId: string }
  | { ok: false; status: number; error: string };

export async function requireFamily(req: NextApiRequest): Promise<FamilyAuthResult> {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) {
    return { ok: false, status: 401, error: "Missing access token." };
  }

  const { data: userData, error: authError } = await supabaseAdmin.auth.getUser(token);
  if (authError || !userData?.user) {
    return { ok: false, status: 401, error: "Invalid or expired session." };
  }

  const membership = await prisma.familyMember.findFirst({
    where: { userId: userData.user.id },
    select: { familyId: true },
  });

  if (!membership) {
    // Should only happen if the /api/auth/bootstrap call never completed
    // for this account — a real (if unlikely) inconsistent state worth a
    // clear error rather than a confusing downstream failure.
    return { ok: false, status: 404, error: "No family found for this account yet — try signing in again." };
  }

  return { ok: true, userId: userData.user.id, familyId: membership.familyId };
}

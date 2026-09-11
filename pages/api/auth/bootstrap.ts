// POST /api/auth/bootstrap
//
// Called once per sign-in (see the onAuthStateChange listener in
// _app.js) right after Supabase Auth confirms a session. Its whole job:
// make sure this user has a Family to belong to — Section 2's core
// principle ("the parent/family account is the primary account") means
// a user with no Family row yet is an invalid state, not just an empty
// one.
//
// Idempotent by design — safe to call on every sign-in, not just the
// first one. A returning user just gets back their existing family;
// only a genuinely new auth.users row results in new rows being
// created. This mirrors the old StoryNest pattern of upserting a
// `profiles` row on login, extended to also create the Family/
// FamilyMember rows the new schema requires that StoryNest never had.
//
// SECURITY: the request body is NOT trusted for identity — the calling
// user's identity comes only from verifying their real Supabase access
// token server-side via supabaseAdmin.auth.getUser(token). A client
// claiming to be a different user's id would fail this check entirely.

import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.SUPABASE_SERVICE_ROLE_KEY as string
);

type BootstrapResponse =
  | { ok: true; familyId: string }
  | { error: string };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<BootstrapResponse>
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: "Missing access token." });
  }

  const { data: userData, error: authError } = await supabaseAdmin.auth.getUser(token);
  if (authError || !userData?.user) {
    return res.status(401).json({ error: "Invalid or expired session." });
  }

  const { id: userId, email } = userData.user;
  if (!email) {
    // Supabase Auth can in principle produce a user with no email (e.g.
    // phone-only auth) -- not a path StoryNest's magic-link flow uses,
    // but worth failing loudly rather than silently creating a User row
    // with a null email that violates the schema's `email String
    // @unique` (non-nullable) constraint.
    return res.status(400).json({ error: "This account has no email on file." });
  }

  try {
    const existing = await prisma.user.findUnique({
      where: { id: userId },
      include: { familyMemberships: { select: { familyId: true } } },
    });

    if (existing) {
      const familyId = existing.familyMemberships[0]?.familyId;
      if (familyId) {
        return res.status(200).json({ ok: true, familyId });
      }
      // A User row exists but somehow has no family membership -- an
      // inconsistent state that shouldn't occur via this endpoint alone,
      // but worth healing rather than erroring, since the alternative is
      // a permanently broken account with no clear recovery path.
      const family = await prisma.family.create({
        data: { members: { create: { userId, role: "OWNER" } } },
      });
      return res.status(200).json({ ok: true, familyId: family.id });
    }

    // Genuinely new user: create User + Family + FamilyMember together.
    // Wrapped in a transaction so a failure partway through (e.g. the
    // family create succeeding but something after it failing) can
    // never leave a User row with no family, or a family with no owner.
    const familyId = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.user.create({
        data: { id: userId, email },
      });
      const family = await tx.family.create({
        data: { members: { create: { userId, role: "OWNER" } } },
      });
      return family.id;
    });

    return res.status(200).json({ ok: true, familyId });
  } catch (err) {
    console.error("auth/bootstrap error:", err);
    return res.status(500).json({ error: "Unexpected server error." });
  }
}

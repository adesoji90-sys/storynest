// Shared by every /api/admin/* route. There is deliberately no
// self-service way to become an admin (no endpoint, no signup flag) —
// the AdminUser table is meant to be populated by direct database
// access, once, by whoever operates this deployment. Anything else
// would let a user grant themselves elevated access, which Section 26
// explicitly warns against ("A user must NEVER be able to access...
// by manipulating" their own privileges).

import type { NextApiRequest } from "next";
import { createClient } from "@supabase/supabase-js";
import { prisma } from "@/lib/prisma";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.SUPABASE_SERVICE_ROLE_KEY as string
);

export type AdminAuthResult =
  | { ok: true; userId: string }
  | { ok: false; status: number; error: string };

export async function requireAdmin(req: NextApiRequest): Promise<AdminAuthResult> {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) {
    return { ok: false, status: 401, error: "Missing access token." };
  }

  const { data: userData, error: authError } = await supabaseAdmin.auth.getUser(token);
  if (authError || !userData?.user) {
    return { ok: false, status: 401, error: "Invalid or expired session." };
  }

  const adminRecord = await prisma.adminUser.findUnique({
    where: { userId: userData.user.id },
  });

  if (!adminRecord) {
    // Deliberately generic (403, no detail) rather than confirming or
    // denying "you're logged in but not an admin" with any more
    // specificity than necessary.
    return { ok: false, status: 403, error: "Not authorized." };
  }

  return { ok: true, userId: userData.user.id };
}

// GET /api/admin/whoami
// A deliberately minimal check — "is the current signed-in user an
// admin, yes or no" — used only by AppHeader to decide whether to show
// a link into the admin area at all. Admins previously had no way to
// reach /admin/books or /admin/dashboard from their normal logged-in
// view; they had to already know and type the URL directly. This is
// the one new piece of information a page like /family needs to fix
// that, without pulling requireAdmin's full logic into every
// parent-facing page.
import type { NextApiRequest, NextApiResponse } from "next";
import { requireAdmin } from "@/lib/authAdmin";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  const auth = await requireAdmin(req);
  return res.status(200).json({ isAdmin: auth.ok });
}

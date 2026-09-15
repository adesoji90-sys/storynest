import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/authAdmin";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  const auth = await requireAdmin(req);
  if (!auth.ok) {
    return res.status(auth.status).json({ error: auth.error });
  }
  const orders = await prisma.printOrder.findMany({
    where: { status: { not: "pending_payment" } }, // unpaid abandoned carts aren't actionable — no reason to show them to an admin fulfilling orders
    orderBy: { createdAt: "desc" },
    include: { book: { select: { title: true, authorName: true } } },
  });
  return res.status(200).json({ orders });
}

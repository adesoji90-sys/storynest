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
  const { id } = req.query;
  if (typeof id !== "string") {
    return res.status(400).json({ error: "Invalid order id." });
  }
  const order = await prisma.printOrder.findFirst({
    where: { id, familyId: auth.familyId },
    include: { book: { select: { title: true } } },
  });
  if (!order) {
    return res.status(404).json({ error: "Order not found." });
  }
  return res.status(200).json({ order });
}

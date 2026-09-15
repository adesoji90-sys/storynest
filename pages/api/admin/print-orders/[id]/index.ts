import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/authAdmin";

const UpdateSchema = z.object({
  status: z.enum(["processing", "shipped", "delivered", "cancelled"]),
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "PATCH") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  const auth = await requireAdmin(req);
  if (!auth.ok) {
    return res.status(auth.status).json({ error: auth.error });
  }
  const { id } = req.query;
  if (typeof id !== "string") {
    return res.status(400).json({ error: "Invalid order id." });
  }
  const parsed = UpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid status." });
  }
  const order = await prisma.printOrder.update({ where: { id }, data: { status: parsed.data.status } });
  return res.status(200).json({ order });
}

// POST /api/print-orders
//
// Creates the order record AND initializes the Paystack transaction in
// the same request — the order exists in "pending_payment" the moment
// this returns, and only ever moves to "paid" via a verified webhook
// event (see webhook.ts), never from anything the client claims
// happened. "Pay immediately upon request" means the redirect to
// Paystack's checkout happens right after this call, not a separate
// later step.
import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireFamily } from "@/lib/authFamily";
import { checkPrintOrdersAllowed } from "@/lib/checkPrintOrdersAllowed";
import { PRINT_PRICES_KOBO } from "@/lib/printPricing";

const CreateOrderSchema = z.object({
  bookId: z.string().uuid(),
  childId: z.string().uuid().optional(),
  coverType: z.enum(["softback", "hardback"]),
  recipientName: z.string().trim().min(1).max(120),
  recipientPhone: z.string().trim().min(7).max(30),
  deliveryAddress: z.string().trim().min(10).max(500),
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const auth = await requireFamily(req);
  if (!auth.ok) {
    return res.status(auth.status).json({ error: auth.error });
  }

  const entitlementCheck = await checkPrintOrdersAllowed(auth.familyId);
  if (!entitlementCheck.ok) {
    return res.status(entitlementCheck.status).json({ error: entitlementCheck.error });
  }

  const parsed = CreateOrderSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message || "Invalid input." });
  }
  const { bookId, childId, coverType, recipientName, recipientPhone, deliveryAddress } = parsed.data;

  // A family can print any book they can actually READ — their own
  // custom book, or any published curated book — not just books they
  // authored. Mirrors the same access shape as assigning a book to a
  // child in the first place.
  const book = await prisma.book.findFirst({
    where: {
      id: bookId,
      OR: [
        { familyId: auth.familyId, type: "CUSTOM" },
        { type: "CURATED", status: "PUBLISHED" },
      ],
    },
  });
  if (!book) {
    return res.status(404).json({ error: "Book not found." });
  }

  if (childId) {
    const child = await prisma.child.findFirst({ where: { id: childId, familyId: auth.familyId } });
    if (!child) {
      return res.status(404).json({ error: "Child not found." });
    }
  }

  const user = await prisma.user.findUnique({ where: { id: auth.userId }, select: { email: true } });
  if (!user?.email) {
    return res.status(400).json({ error: "Couldn't find an email on your account to send the receipt to." });
  }

  const priceMinorUnits = PRINT_PRICES_KOBO[coverType]!;

  try {
    const order = await prisma.printOrder.create({
      data: {
        familyId: auth.familyId,
        bookId,
        childId,
        coverType,
        priceMinorUnits,
        currency: "NGN",
        recipientName,
        recipientPhone,
        deliveryAddress,
        status: "pending_payment",
      },
    });

    const paystackRes = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
      },
      body: JSON.stringify({
        email: user.email,
        amount: priceMinorUnits,
        currency: "NGN",
        callback_url: `${process.env.NEXT_PUBLIC_SITE_URL || ""}/print-orders/${order.id}`,
        metadata: { printOrderId: order.id, type: "print_order" },
      }),
    });
    const paystackData = await paystackRes.json();
    if (!paystackRes.ok || !paystackData?.data?.authorization_url) {
      console.error("Paystack initialize error:", paystackData);
      await prisma.printOrder.update({ where: { id: order.id }, data: { status: "cancelled" } });
      return res.status(502).json({ error: "Couldn't start payment — try again." });
    }

    await prisma.printOrder.update({
      where: { id: order.id },
      data: { paystackReference: paystackData.data.reference },
    });

    return res.status(201).json({ authorizationUrl: paystackData.data.authorization_url, orderId: order.id });
  } catch (err) {
    console.error("print-orders POST error:", err);
    return res.status(500).json({ error: "Unexpected server error." });
  }
}

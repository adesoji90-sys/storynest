// POST /api/print-orders/webhook
// Configure this URL in Paystack's dashboard as a SEPARATE webhook
// endpoint from /api/paystack-webhook — that one is tied to the old
// subscription/profile tables and unrelated logic; keeping this
// completely separate avoids entangling a new feature with old code
// neither of us wants to touch. Same signature-verification approach
// as that file though (raw body + HMAC-SHA512) — this is Paystack's
// own required method, not something to reinvent per-endpoint.
export const config = {
  api: {
    bodyParser: false,
  },
};

import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { sendStoryEmail } from "@/lib/email";

function readRawBody(req: any): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk: any) => (data += chunk));
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const rawBody = await readRawBody(req);
  const hash = crypto
    .createHmac("sha512", process.env.PAYSTACK_SECRET_KEY as string)
    .update(rawBody)
    .digest("hex");

  if (hash !== req.headers["x-paystack-signature"]) {
    // Never trust an unsigned or mis-signed body — this is the ONLY
    // thing standing between "a real payment happened" and "someone
    // POSTed a fake success event at this URL."
    return res.status(401).json({ error: "Invalid signature." });
  }

  const event = JSON.parse(rawBody);

  if (event.event === "charge.success" && event.data?.metadata?.type === "print_order") {
    const reference = event.data.reference;
    const order = await prisma.printOrder.findUnique({
      where: { paystackReference: reference },
      include: {
        book: { select: { title: true, authorName: true, pdfAsset: { select: { bucket: true, storageKey: true } } } },
      },
    });

    if (!order) {
      console.error(`print-order webhook: no order found for reference ${reference}`);
      return res.status(200).json({ received: true }); // acknowledge anyway — Paystack retries on non-2xx, and a missing order isn't something retrying fixes
    }

    if (order.status === "paid") {
      return res.status(200).json({ received: true }); // already processed — Paystack can send the same event more than once
    }

    await prisma.printOrder.update({ where: { id: order.id }, data: { status: "paid" } });

    // Admin notification — the PDF is linked, not attached. A
    // print-ready book PDF is a real, multi-page file; emailing it as
    // a base64 attachment is both expensive and likely to hit size
    // limits on a lot of mail providers. A link the admin can open
    // (public bucket, no signing needed) is more reliable and just as
    // fast to act on.
    const pdfUrl = order.book.pdfAsset
      ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${order.book.pdfAsset.bucket}/${order.book.pdfAsset.storageKey}`
      : null;

    const adminEmail = process.env.PRINT_ORDER_ADMIN_EMAIL;
    if (adminEmail) {
      try {
        await sendStoryEmail({
          to: adminEmail,
          subject: `New print order: ${order.book.title} (${order.coverType})`,
          attachmentBase64: undefined,
          attachmentFilename: undefined,
          html: `
            <h2>New print order</h2>
            <p><strong>Book:</strong> ${order.book.title}${order.book.authorName ? ` by ${order.book.authorName}` : ""}</p>
            <p><strong>Cover:</strong> ${order.coverType}</p>
            <p><strong>Amount paid:</strong> ₦${(order.priceMinorUnits / 100).toLocaleString()}</p>
            <p><strong>Deliver to:</strong> ${order.recipientName}, ${order.recipientPhone}</p>
            <p>${order.deliveryAddress}</p>
            ${pdfUrl ? `<p><a href="${pdfUrl}">Download the print-ready PDF</a></p>` : "<p><strong>No print-ready PDF exists for this book yet — generate one before fulfilling this order.</strong></p>"}
          `,
        });
        await prisma.printOrder.update({ where: { id: order.id }, data: { adminNotifiedAt: new Date() } });
      } catch (emailErr) {
        // Payment already succeeded and the order is marked paid — an
        // email failure shouldn't undo that or fail the webhook (which
        // would make Paystack retry a payment that already went
        // through). Logged for follow-up, not silently lost: the order
        // is still visible in /admin/print-orders regardless.
        console.error("print-order admin notification failed:", emailErr);
      }
    } else {
      console.warn("PRINT_ORDER_ADMIN_EMAIL not set — skipping admin notification.");
    }
  }

  return res.status(200).json({ received: true });
}

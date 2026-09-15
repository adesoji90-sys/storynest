// Same shape as checkCustomBooksAllowed, for the same reason: one
// shared check reused everywhere print ordering needs gating, so it
// can't drift into several slightly different versions. Unlike
// customBooksAllowed's "missing entitlement = allowed" philosophy,
// this one is opt-IN by design — printOrdersAllowed defaults to false
// on the Entitlement/Plan models specifically because ordering a
// physical book means real money changing hands immediately; a data
// gap should never accidentally grant that, only an explicit plan
// setting should.
import { prisma } from "@/lib/prisma";

export async function checkPrintOrdersAllowed(
  familyId: string
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const entitlement = await prisma.entitlement.findUnique({
    where: { familyId },
    select: { printOrdersAllowed: true },
  });
  if (!entitlement?.printOrdersAllowed) {
    return {
      ok: false,
      status: 403,
      error: "Ordering printed books needs the Family plan.",
    };
  }
  return { ok: true };
}

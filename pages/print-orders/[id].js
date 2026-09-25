import { useEffect, useState } from "react";
import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { supabaseBrowser } from "@/lib/supabaseBrowserClient";
import AppHeader from "@/components/AppHeader";
import { Card } from "@/components/ui";

// Landed on right after Paystack's checkout redirect. Payment is
// confirmed via webhook, not this page load — this just polls the
// order's current status a couple of times in case the webhook hasn't
// landed yet by the time the browser gets here (webhooks and browser
// redirects race independently; the redirect usually wins).
export default function PrintOrderStatus() {
  const router = useRouter();
  const { id } = router.query;
  const [session, setSession] = useState(undefined);
  const [order, setOrder] = useState(null);

  useEffect(() => {
    supabaseBrowser.auth.getSession().then(({ data }) => setSession(data.session));
  }, []);

  useEffect(() => {
    if (!session || !id) return;
    let attempts = 0;
    let cancelled = false;

    async function poll() {
      const res = await fetch(`/api/print-orders/${id}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const data = await res.json();
      if (cancelled) return;
      if (res.ok) setOrder(data.order);
      attempts += 1;
      if (data.order?.status === "pending_payment" && attempts < 6) {
        setTimeout(poll, 2000);
      }
    }
    poll();
    return () => {
      cancelled = true;
    };
  }, [session, id]);

  if (session === undefined) return null;

  return (
    <>
      <Head><title>Print order — Derek</title></Head>
      <main className="min-h-screen bg-ivory_cloth text-charcoal">
        <AppHeader />
        <div className="mx-auto max-w-lg px-6 py-16 text-center">
          {!order ? (
            <p className="font-body text-charcoal/50">Loading…</p>
          ) : order.status === "paid" ? (
            <Card>
              <p className="font-display text-2xl">🎉 Order confirmed!</p>
              <p className="mt-3 font-body text-charcoal/70">
                Your {order.coverType} copy of "{order.book.title}" is being prepared. Expect delivery in 4–7 days.
              </p>
            </Card>
          ) : order.status === "pending_payment" ? (
            <Card>
              <p className="font-display text-xl">Confirming payment…</p>
              <p className="mt-2 font-body text-sm text-charcoal/60">This can take a few seconds.</p>
            </Card>
          ) : (
            <Card>
              <p className="font-display text-xl">Something went wrong with this order.</p>
              <p className="mt-2 font-body text-sm text-charcoal/60">Contact support if you were charged.</p>
            </Card>
          )}
          <Link href="/library" className="mt-6 inline-block font-body text-sm font-semibold text-coral_ember">
            ← Back to library
          </Link>
        </div>
      </main>
    </>
  );
}

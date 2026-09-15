import { useEffect, useState } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import { supabaseBrowser } from "@/lib/supabaseBrowserClient";
import AdminHeader from "@/components/AdminHeader";
import { Card, Badge } from "@/components/ui";

const NEXT_STATUS = {
  paid: "processing",
  processing: "shipped",
  shipped: "delivered",
};
const NEXT_LABEL = {
  paid: "Mark as processing",
  processing: "Mark as shipped",
  shipped: "Mark as delivered",
};

export default function AdminPrintOrders() {
  const router = useRouter();
  const [session, setSession] = useState(undefined);
  const [authorized, setAuthorized] = useState(null);
  const [orders, setOrders] = useState([]);
  const [error, setError] = useState("");
  const [updatingId, setUpdatingId] = useState(null);

  useEffect(() => {
    supabaseBrowser.auth.getSession().then(({ data }) => {
      if (!data.session) return router.push("/login?redirect=/admin/print-orders");
      setSession(data.session);
    });
  }, [router]);

  useEffect(() => {
    if (!session) return;
    (async () => {
      const res = await fetch("/api/admin/print-orders", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const data = await res.json();
      if (!res.ok) {
        setAuthorized(false);
        return setError(data.error || "Not authorized.");
      }
      setAuthorized(true);
      setOrders(data.orders);
    })();
  }, [session]);

  async function updateStatus(order, status) {
    setUpdatingId(order.id);
    try {
      const res = await fetch(`/api/admin/print-orders/${order.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ status }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn't update the order.");
      setOrders((prev) => prev.map((o) => (o.id === order.id ? { ...o, status } : o)));
    } catch (err) {
      setError(err.message);
    } finally {
      setUpdatingId(null);
    }
  }

  if (session === undefined || authorized === null) return null;
  if (!authorized) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-ivory_cloth">
        <p className="font-body text-charcoal/60">{error}</p>
      </main>
    );
  }

  return (
    <>
      <Head><title>Print orders — Admin</title></Head>
      <main className="min-h-screen bg-ivory_cloth text-charcoal">
        <AdminHeader />
        <div className="mx-auto max-w-3xl px-6 py-10">
          <h1 className="font-display text-3xl">Print orders</h1>
          {error && <p className="mt-4 font-body text-sm text-coral_ember">{error}</p>}
          {orders.length === 0 ? (
            <p className="mt-8 font-body text-charcoal/50">No orders yet.</p>
          ) : (
            <div className="mt-6 space-y-4">
              {orders.map((order) => (
                <Card key={order.id}>
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-body font-bold">{order.book.title}</p>
                      <p className="mt-1 font-body text-sm text-charcoal/60">
                        {order.coverType} · ₦{(order.priceMinorUnits / 100).toLocaleString()}
                      </p>
                      <p className="mt-2 font-body text-sm">{order.recipientName} · {order.recipientPhone}</p>
                      <p className="font-body text-sm text-charcoal/60">{order.deliveryAddress}</p>
                    </div>
                    <Badge>{order.status}</Badge>
                  </div>
                  {NEXT_STATUS[order.status] && (
                    <button
                      onClick={() => updateStatus(order, NEXT_STATUS[order.status])}
                      disabled={updatingId === order.id}
                      className="mt-4 rounded-cloth border border-charcoal/15 px-4 py-2 font-body text-sm font-semibold disabled:opacity-50"
                    >
                      {updatingId === order.id ? "Updating…" : NEXT_LABEL[order.status]}
                    </button>
                  )}
                </Card>
              ))}
            </div>
          )}
        </div>
      </main>
    </>
  );
}

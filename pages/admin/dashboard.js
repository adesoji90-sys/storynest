import { useEffect, useState } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import { supabaseBrowser } from "@/lib/supabaseBrowserClient";
import AdminHeader from "@/components/AdminHeader";
import { Card, FeatureCard, Badge } from "@/components/ui";

const STATUS_COLOR = {
  PROCESSING: "text-marigold",
  COMPLETED: "text-leaf",
  FAILED: "text-coral_ember",
};

export default function AdminDashboard() {
  const router = useRouter();
  const [session, setSession] = useState(undefined);
  const [authorized, setAuthorized] = useState(null);
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    supabaseBrowser.auth.getSession().then(({ data }) => {
      if (!data.session) return router.push("/login?redirect=/admin/dashboard");
      setSession(data.session);
    });
  }, [router]);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;

    async function load() {
      const res = await fetch("/api/admin/dashboard", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const json = await res.json();
      if (cancelled) return;
      if (!res.ok) {
        setAuthorized(false);
        return setError(json.error || "Not authorized.");
      }
      setAuthorized(true);
      setData(json);
    }
    load();
    // Polled, not a persistent connection — simple and good enough for
    // an admin dashboard someone glances at occasionally, not a
    // real-time trading terminal. 5s is frequent enough to feel "live"
    // while someone's watching a batch of books illustrate.
    const interval = setInterval(load, 5000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [session]);

  if (session === undefined || authorized === null) return null;
  if (!authorized) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-ivory_cloth">
        <p className="font-body text-charcoal/60">{error}</p>
      </main>
    );
  }

  const totalCostKobo = data?.costByOperation.reduce((sum, c) => sum + c.totalCostMinorUnits, 0) || 0;

  return (
    <>
      <Head><title>Dashboard — Admin</title></Head>
      <main className="min-h-screen bg-ivory_cloth text-charcoal">
        <AdminHeader />
        <div className="mx-auto max-w-4xl px-6 py-10">
          <h1 className="font-display text-3xl">Dashboard</h1>

          {!data ? (
            <p className="mt-8 font-body text-charcoal/50">Loading…</p>
          ) : (
            <>
              <div className="mt-6 grid gap-4 sm:grid-cols-4">
                <Card><p className="font-display text-3xl">{data.totalFamilies}</p><p className="font-body text-sm text-charcoal/60">Families</p></Card>
                <Card><p className="font-display text-3xl">{data.totalBooks}</p><p className="font-body text-sm text-charcoal/60">Total books</p></Card>
                <Card><p className="font-display text-3xl">{data.totalCurated}</p><p className="font-body text-sm text-charcoal/60">Curated</p></Card>
                <Card><p className="font-display text-3xl">{data.totalCustom}</p><p className="font-body text-sm text-charcoal/60">Custom</p></Card>
              </div>

              {data.activeJobCount > 0 && (
                <FeatureCard className="mt-6">
                  <p className="font-display text-xl">🔄 {data.activeJobCount} generation job{data.activeJobCount !== 1 ? "s" : ""} in progress right now</p>
                </FeatureCard>
              )}

              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                <Card>
                  <p className="font-body font-bold">Print order revenue</p>
                  <p className="mt-1 font-body text-xs text-charcoal/50">Excludes unpaid/abandoned carts.</p>
                  <div className="mt-4 space-y-2">
                    {data.printOrdersByStatus.length === 0 ? (
                      <p className="font-body text-sm text-charcoal/50">No paid orders yet.</p>
                    ) : (
                      data.printOrdersByStatus.map((p) => (
                        <div key={p.status} className="flex items-center justify-between border-b border-charcoal/10 pb-2">
                          <span className="font-body text-sm capitalize">{p.status} <span className="text-charcoal/40">({p.count})</span></span>
                          <span className="font-body text-sm font-semibold">₦{(p.totalRevenueMinorUnits / 100).toLocaleString()}</span>
                        </div>
                      ))
                    )}
                    {data.printOrdersByStatus.length > 0 && (
                      <div className="flex items-center justify-between pt-2">
                        <span className="font-body font-bold">Total</span>
                        <span className="font-body font-bold">
                          ₦{(data.printOrdersByStatus.reduce((sum, p) => sum + p.totalRevenueMinorUnits, 0) / 100).toLocaleString()}
                        </span>
                      </div>
                    )}
                  </div>
                </Card>

                <Card>
                  <p className="font-body font-bold">Families by tier</p>
                  <div className="mt-4 space-y-2">
                    {data.familiesByTier.map((f) => (
                      <div key={f.tier} className="flex items-center justify-between border-b border-charcoal/10 pb-2">
                        <span className="font-body text-sm">{f.tier}</span>
                        <span className="font-body text-sm font-semibold">{f.count}</span>
                      </div>
                    ))}
                  </div>
                </Card>
              </div>

              <Card className="mt-6">
                <p className="font-body font-bold">AI spend by operation</p>
                <p className="mt-1 font-body text-xs text-charcoal/50">
                  Estimated, not exact — see each provider's own cost-estimate comments in the code for known accuracy caveats.
                  Converted at ₦{(data.usdToNgnKoboRate / 100).toLocaleString()} per $1 — a placeholder rate, not a live one; update
                  it in lib/ai/costEstimate.ts if it drifts from reality.
                </p>
                <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[380px] font-body text-sm">
                  <thead>
                    <tr className="border-b border-charcoal/10 text-left text-xs text-charcoal/40">
                      <th className="pb-2 font-normal">Operation</th>
                      <th className="pb-2 text-right font-normal">USD</th>
                      <th className="pb-2 text-right font-normal">NGN</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.costByOperation.map((c) => (
                      <tr key={c.operationType} className="border-b border-charcoal/10">
                        <td className="py-2">{c.operationType} <span className="text-charcoal/40">({c.count})</span></td>
                        <td className="py-2 text-right">${c.totalCostUsd.toFixed(2)}</td>
                        <td className="py-2 text-right font-semibold">₦{(c.totalCostMinorUnits / 100).toLocaleString()}</td>
                      </tr>
                    ))}
                    <tr>
                      <td className="pt-2 font-bold">Total</td>
                      <td className="pt-2 text-right font-bold">${(totalCostKobo / data.usdToNgnKoboRate).toFixed(2)}</td>
                      <td className="pt-2 text-right font-bold">₦{(totalCostKobo / 100).toLocaleString()}</td>
                    </tr>
                  </tbody>
                </table>
                </div>
              </Card>

              <Card className="mt-6">
                <p className="font-body font-bold">Cost per book</p>
                <p className="mt-1 font-body text-xs text-charcoal/50">Top 20 by spend — text, illustration, and narration combined.</p>
                {data.costByBook.length === 0 ? (
                  <p className="mt-4 font-body text-sm text-charcoal/50">No AI generation costs recorded yet.</p>
                ) : (
                  <div className="mt-4 overflow-x-auto">
                  <table className="w-full min-w-[420px] font-body text-sm">
                    <thead>
                      <tr className="border-b border-charcoal/10 text-left text-xs text-charcoal/40">
                        <th className="pb-2 font-normal">Book</th>
                        <th className="pb-2 text-right font-normal">USD</th>
                        <th className="pb-2 text-right font-normal">NGN</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.costByBook.map((b) => (
                        <tr key={b.bookId} className="border-b border-charcoal/10">
                          <td className="py-2">
                            {b.title}
                            {b.type && <Badge className="ml-2">{b.type}</Badge>}
                            <span className="ml-2 text-xs text-charcoal/40">{b.operationCount} op{b.operationCount !== 1 ? "s" : ""}</span>
                          </td>
                          <td className="py-2 text-right">${b.totalCostUsd.toFixed(2)}</td>
                          <td className="py-2 text-right font-semibold">₦{(b.totalCostMinorUnits / 100).toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  </div>
                )}
              </Card>

              <Card className="mt-6">
                <p className="font-body font-bold">Recent generation jobs</p>
                <div className="mt-4 space-y-2">
                  {data.recentJobs.length === 0 ? (
                    <p className="font-body text-sm text-charcoal/50">No generation jobs yet.</p>
                  ) : (
                    data.recentJobs.map((job) => (
                      <div key={job.id} className="flex items-center justify-between gap-2 border-b border-charcoal/10 pb-2">
                        <div className="min-w-0">
                          <span className="font-body text-sm font-semibold">{job.book?.title || "Untitled"}</span>
                          <span className="ml-2 font-body text-xs text-charcoal/40">{job.jobType}</span>
                        </div>
                        <Badge className={`shrink-0 ${STATUS_COLOR[job.status] || ""}`}>{job.status}</Badge>
                      </div>
                    ))
                  )}
                </div>
              </Card>
            </>
          )}
        </div>
      </main>
    </>
  );
}

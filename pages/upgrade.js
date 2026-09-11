import Head from "next/head";
import Link from "next/link";

// Deliberately NOT a real checkout flow yet — Step 11 built the
// Plan/Entitlement data model and enforcement (max_children etc.), but
// never connected it to actual payment. StoryNest's existing Paystack
// integration works, but it writes to a completely different, older set
// of database columns unrelated to this new Plan/Subscription/
// Entitlement schema. This page is honest about that gap rather than
// pretending a real upgrade flow exists — it explains the plan and asks
// the parent to reach out, rather than taking a payment this app can't
// yet actually apply anywhere.
export default function Upgrade() {
  return (
    <>
      <Head>
        <title>Upgrade — StoryNest</title>
      </Head>
      <main className="flex min-h-screen flex-col items-center justify-center bg-ivory_cloth px-6 text-center text-charcoal">
        <div className="w-full max-w-md rounded-cloth bg-white p-8 shadow-sm">
          <h1 className="font-display text-2xl">The Family plan</h1>
          <ul className="mt-4 space-y-2 text-left font-body text-charcoal/70">
            <li>• Up to 5 children, each with their own profile and reading progress</li>
            <li>• Everything in the library, plus custom AI-generated books</li>
          </ul>
          <p className="mt-6 font-body text-sm text-charcoal/60">
            Self-serve upgrades aren't available on the site just yet — reach out and we'll get you set up.
          </p>
          <Link href="/family" className="mt-6 inline-block font-body text-sm font-semibold text-coral_ember">
            ← Back to your family
          </Link>
        </div>
      </main>
    </>
  );
}

import { useEffect, useState } from "react";
import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { supabaseBrowser } from "@/lib/supabaseBrowserClient";
import { getReadingModeChildId, exitReadingMode } from "@/lib/readingMode";
import ExitReadingModeGate from "@/components/ExitReadingModeGate";

// The locked-down hub a child actually sees — no family management, no
// Story Studio, no library browsing, just their own assigned books and
// a big "start reading" tap target. Reached via the "Read" button per
// child on /family (see family.js), and enforced by the route guard in
// _app.js so a direct URL or the browser's back button can't escape it
// without solving the exit gate first.
export default function ReadingMode() {
  const router = useRouter();
  const [session, setSession] = useState(undefined);
  const [childId, setChildId] = useState(null);
  const [child, setChild] = useState(null);
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showExitGate, setShowExitGate] = useState(false);

  useEffect(() => {
    const id = getReadingModeChildId();
    if (!id) {
      router.replace("/family");
      return;
    }
    setChildId(id);
  }, [router]);

  useEffect(() => {
    async function checkSession() {
      const { data } = await supabaseBrowser.auth.getSession();
      if (!data.session) {
        // Reading Mode doesn't survive a logged-out session either —
        // there's no separate child account to fall back to.
        router.replace("/login");
        return;
      }
      setSession(data.session);
    }
    checkSession();
  }, [router]);

  useEffect(() => {
    if (!session || !childId) return;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const token = session.access_token;
        const [famRes, assignRes] = await Promise.all([
          fetch("/api/family/me", { headers: { Authorization: `Bearer ${token}` } }),
          fetch(`/api/assignments?childId=${childId}`, { headers: { Authorization: `Bearer ${token}` } }),
        ]);
        const famData = await famRes.json();
        const assignData = await assignRes.json();
        if (!famRes.ok) throw new Error(famData.error || "Couldn't load.");
        if (!assignRes.ok) throw new Error(assignData.error || "Couldn't load books.");
        const thisChild = famData.children.find((c) => c.id === childId);
        if (!thisChild) throw new Error("Child not found.");
        setChild(thisChild);
        setAssignments(assignData.assignments);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [session, childId]);

  function handleExitSuccess() {
    exitReadingMode();
    router.replace("/family");
  }

  if (session === undefined || !childId) return null;

  return (
    <>
      <Head>
        <title>{child ? `${child.name}'s books` : "Reading"} — StoryNest</title>
      </Head>
      <main className="min-h-screen bg-ivory_cloth px-6 py-10 text-charcoal">
        <div className="mx-auto max-w-3xl">
          <h1 className="text-center font-display text-4xl">
            {child ? `${child.name}'s Books` : "Books"}
          </h1>

          {error && <p className="mt-4 text-center font-body text-coral_ember">{error}</p>}

          {loading ? (
            <p className="mt-10 text-center font-body text-charcoal/50">Loading…</p>
          ) : assignments.length === 0 ? (
            <p className="mt-10 text-center font-body text-charcoal/50">
              No books yet — ask a grown-up to add some!
            </p>
          ) : (
            <div className="mt-10 grid gap-5 sm:grid-cols-2">
              {assignments.map((a) => (
                <Link
                  key={a.id}
                  href={`/read/${a.book.id}?childId=${childId}`}
                  className="flex flex-col items-center rounded-cloth bg-white p-6 text-center shadow-sm transition hover:shadow-md"
                >
                  <span className="text-4xl">📖</span>
                  <span className="mt-3 font-display text-lg">{a.book.title}</span>
                  {a.progress?.completedAt ? (
                    <span className="mt-1 font-body text-sm font-semibold text-leaf">✓ Finished</span>
                  ) : a.progress ? (
                    <span className="mt-1 font-body text-sm text-charcoal/50">{a.progress.percentage}% done</span>
                  ) : (
                    <span className="mt-1 font-body text-sm text-coral_ember">Start reading</span>
                  )}
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Muted, not colorful or animated, so it doesn't invite a young
            child's curiosity — but a real button (icon + border), not
            near-invisible text, so a parent scanning the screen can
            actually find it. The lock icon is a deliberate, recognizable
            signal: several real kids' apps use the same "small padlock
            in the corner" convention for exactly this purpose. */}
        <button
          onClick={() => setShowExitGate(true)}
          className="fixed bottom-4 right-4 flex items-center gap-1.5 rounded-full border border-charcoal/20 bg-white px-3 py-2 font-body text-sm text-charcoal/60 shadow-sm"
        >
          🔒 Parent exit
        </button>
      </main>

      {showExitGate && (
        <ExitReadingModeGate
          accessToken={session.access_token}
          onCancel={() => setShowExitGate(false)}
          onSuccess={handleExitSuccess}
        />
      )}
    </>
  );
}

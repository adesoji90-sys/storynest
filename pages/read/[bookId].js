import { useEffect, useState } from "react";
import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { supabaseBrowser } from "@/lib/supabaseBrowserClient";
import { getReadingModeChildId } from "@/lib/readingMode";

export default function Reader() {
  const router = useRouter();
  const { bookId, childId } = router.query;
  const [session, setSession] = useState(undefined);
  const [book, setBook] = useState(null);
  const [pageIndex, setPageIndex] = useState(0); // 0-based into book.pages
  const [sessionId, setSessionId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [justCompleted, setJustCompleted] = useState(false);

  useEffect(() => {
    async function checkSession() {
      const { data } = await supabaseBrowser.auth.getSession();
      if (!data.session) {
        router.replace(`/login?redirect=/read/${bookId}?childId=${childId}`);
        return;
      }
      setSession(data.session);
    }
    if (router.isReady) checkSession();
  }, [router, router.isReady, bookId, childId]);

  useEffect(() => {
    if (!session || !bookId || !childId) return;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const res = await fetch(`/api/read/${bookId}?childId=${childId}`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Couldn't open this book.");
        setBook(data.book);
        setSessionId(data.sessionId);
        // Resume from where they left off, clamped to a valid index.
        const resumeIndex = Math.min(Math.max(data.progress.currentPage - 1, 0), data.book.pages.length - 1);
        setPageIndex(resumeIndex);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [session, bookId, childId]);

  async function updateProgress(newIndex) {
    if (!book || !sessionId) return;
    const currentPage = newIndex + 1;
    try {
      const res = await fetch(`/api/read/${bookId}/progress`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ childId, sessionId, currentPage }),
      });
      const data = await res.json();
      if (res.ok && data.completed) setJustCompleted(true);
    } catch {
      // Progress-tracking is not allowed to block the reading experience
      // itself — if this fails, the child can keep reading; only their
      // resume point might be stale next time, not something worth
      // interrupting a bedtime story to report.
    }
  }

  function goToPage(newIndex) {
    if (newIndex < 0 || newIndex >= book.pages.length) return;
    setPageIndex(newIndex);
    updateProgress(newIndex);
  }

  if (session === undefined || loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-ivory_cloth">
        <p className="font-body text-charcoal/50">Loading…</p>
      </main>
    );
  }

  if (error) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-ivory_cloth px-6 text-center">
        <p className="font-body text-coral_ember">{error}</p>
        <Link href="/library" className="font-body text-sm font-semibold text-charcoal/60">← Back to library</Link>
      </main>
    );
  }

  if (!book) return null;

  const page = book.pages[pageIndex];
  const isFirst = pageIndex === 0;
  const isLast = pageIndex === book.pages.length - 1;

  return (
    <>
      <Head>
        <title>{book.title} — StoryNest</title>
      </Head>
      <main className="flex min-h-screen flex-col bg-ivory_cloth text-charcoal">
        <header className="flex items-center justify-between px-6 py-4">
          <Link
            href={getReadingModeChildId() ? "/reading-mode" : "/family"}
            className="font-body text-sm text-charcoal/60"
          >
            ← Exit book
          </Link>
          <p className="font-body text-sm text-charcoal/50">
            Page {pageIndex + 1} of {book.pages.length}
          </p>
        </header>

        <div className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center px-6 pb-12 text-center">
          <h1 className="font-display text-2xl">{book.title}</h1>
          <p className="mt-8 font-body text-xl leading-relaxed">{page.text}</p>

          {isLast && justCompleted && (
            <p className="mt-8 font-body font-bold text-leaf">🎉 The End — great reading!</p>
          )}
        </div>

        <div className="flex items-center justify-between px-6 pb-8">
          <button
            onClick={() => goToPage(pageIndex - 1)}
            disabled={isFirst}
            className="rounded-cloth border border-charcoal/15 px-6 py-3 font-body font-semibold disabled:opacity-30"
          >
            ← Previous
          </button>
          <button
            onClick={() => goToPage(pageIndex + 1)}
            disabled={isLast}
            className="rounded-cloth bg-coral_ember px-6 py-3 font-body font-bold text-white disabled:opacity-30"
          >
            Next →
          </button>
        </div>
      </main>
    </>
  );
}

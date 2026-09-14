import { useEffect, useRef, useState } from "react";
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
  const audioRef = useRef(null);
  const [showingCover, setShowingCover] = useState(true);
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
        // The cover is a one-time "open the book" moment, not an
        // obstacle on every return visit — only show it when actually
        // starting fresh (or if there's no cover at all, skip straight
        // to reading regardless).
        setShowingCover(!!data.book.coverUrl && resumeIndex === 0);
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

  // Auto-plays narration on every page change — including the very
  // first page shown, whether that's from opening the book fresh or
  // resuming mid-book. Keyed on pageIndex (not called directly inside
  // goToPage) specifically because React's state update is async:
  // calling .play() immediately inside goToPage would still be pointed
  // at the PREVIOUS page's audio src, since the DOM hasn't re-rendered
  // with the new page yet at that exact moment. This still runs as an
  // immediate, fast follow-up to the "Next"/"Previous" click that
  // triggered it, which is what lets browsers actually allow the
  // autoplay — the .catch() below is for the rarer case where a
  // browser's autoplay policy blocks it anyway; the child can still
  // tap play manually, this isn't a bug to force around.
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.play().catch(() => {});
    }
  }, [pageIndex]);

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

  if (showingCover) {
    return (
      <>
        <Head>
          <title>{book.title} — StoryNest</title>
        </Head>
        <main className="flex min-h-screen flex-col items-center justify-center bg-charcoal px-6 py-10">
          <div className="relative aspect-[2/3] w-full max-w-sm overflow-hidden rounded-cloth shadow-2xl">
            {book.coverUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- public bucket, dynamic per-book image
              <img src={book.coverUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="h-full w-full bg-indigo_night" />
            )}
            {/* Real text overlaid on top of the (deliberately text-free)
                generated art — see lib/illustration.ts's generateBookCover
                comment for why the title is never baked into the image
                itself. */}
            <div className="absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-charcoal/80 via-charcoal/10 to-transparent p-6 text-center">
              <h1 className="font-display text-3xl text-white drop-shadow">{book.title}</h1>
              {book.authorName && (
                <p className="mt-2 font-body text-sm text-white/80">by {book.authorName}</p>
              )}
            </div>
          </div>

          <button
            onClick={() => setShowingCover(false)}
            className="mt-8 rounded-cloth bg-coral_ember px-8 py-3 font-body font-bold text-white shadow-lg"
          >
            Open book →
          </button>
          <Link
            href={getReadingModeChildId() ? "/reading-mode" : "/family"}
            className="mt-4 font-body text-sm text-white/50"
          >
            ← Exit
          </Link>
        </main>
      </>
    );
  }

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

        {/* The actual "open book" look: one shared card (not two
            separate ones) with a visible center spine — a gradient
            shadow down the middle plus a thin darker line — and outer
            edge shadows suggesting page thickness on both sides. This
            is deliberately one continuous surface, not two cards
            sitting side by side, since that's what makes it read as an
            open book rather than just "a picture next to some text." */}
        <div className="relative mx-auto flex w-full max-w-4xl flex-1 flex-col overflow-hidden rounded-cloth bg-white shadow-2xl md:mb-8 md:flex-row">
          <div
            className="pointer-events-none absolute inset-y-0 left-1/2 hidden w-10 -translate-x-1/2 md:block"
            style={{
              background:
                "linear-gradient(90deg, rgba(0,0,0,0.08), rgba(0,0,0,0.02) 20%, rgba(0,0,0,0.02) 80%, rgba(0,0,0,0.08))",
            }}
          />
          <div
            className="pointer-events-none absolute inset-y-0 left-1/2 hidden w-px -translate-x-1/2 bg-charcoal/10 md:block"
          />

          <div className="relative flex flex-1 items-center justify-center p-6 md:aspect-square md:p-8">
            {page.illustrationUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- signed
              // URLs from a private bucket, not something next/image's
              // static-optimization/remote-pattern config is set up for.
              <img src={page.illustrationUrl} alt="" className="max-h-96 w-full rounded-cloth object-contain md:max-h-none" />
            ) : (
              <div className="flex h-64 w-full items-center justify-center rounded-cloth bg-ivory_cloth text-charcoal/30 md:h-full">
                <span className="font-body text-sm">No illustration yet</span>
              </div>
            )}
            <span className="absolute bottom-3 left-4 font-body text-xs text-charcoal/30">{pageIndex + 1}</span>
          </div>

          <div className="relative flex flex-1 flex-col justify-center p-6 text-center md:p-10 md:text-left">
            <p className="font-body text-xl leading-relaxed">{page.text}</p>

            {page.narrationUrl && (
              <div className="mt-6">
                <audio key={page.id} ref={audioRef} controls src={page.narrationUrl} className="w-full" />
                {/* Required disclosure, not optional — OpenAI's usage
                    policy for its TTS models requires telling
                    listeners the voice is AI-generated, not human. */}
                <p className="mt-1 font-body text-xs text-charcoal/40">🔊 AI-narrated voice</p>
              </div>
            )}

            {isLast && justCompleted && (
              <p className="mt-6 font-body font-bold text-leaf">🎉 The End — great reading!</p>
            )}
            <span className="absolute bottom-3 right-4 font-body text-xs text-charcoal/30">{pageIndex + 1}</span>
          </div>
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

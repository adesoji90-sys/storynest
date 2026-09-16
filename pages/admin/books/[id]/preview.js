import { useEffect, useState } from "react";
import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { supabaseBrowser } from "@/lib/supabaseBrowserClient";
import AdminHeader from "@/components/AdminHeader";
import { Card } from "@/components/ui";

// Deliberately a scrollable, all-pages-at-once view rather than a
// page-by-page click-through like the real reader — an admin checking
// a book's content wants to scan the whole thing quickly for QA, not
// experience it the way a child would. No progress tracking, no
// "Reading Mode" concerns; this is pure content review.
export default function AdminBookPreview() {
  const router = useRouter();
  const { id } = router.query;
  const [session, setSession] = useState(undefined);
  const [book, setBook] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    supabaseBrowser.auth.getSession().then(({ data }) => {
      if (!data.session) return router.push(`/login?redirect=/admin/books/${id}/preview`);
      setSession(data.session);
    });
  }, [router, id]);

  useEffect(() => {
    if (!session || !id) return;
    (async () => {
      const res = await fetch(`/api/admin/books/${id}/preview`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const data = await res.json();
      if (!res.ok) return setError(data.error || "Couldn't load this book.");
      setBook(data.book);
    })();
  }, [session, id]);

  if (session === undefined) return null;

  return (
    <>
      <Head><title>{book ? `${book.title} — Preview` : "Preview"}</title></Head>
      <main className="min-h-screen bg-ivory_cloth text-charcoal">
        <AdminHeader />
        <div className="mx-auto max-w-2xl px-6 py-10">
          <Link href="/admin/books" className="font-body text-sm text-charcoal/60">← Back to Books</Link>

          {error && <p className="mt-4 font-body text-sm text-coral_ember">{error}</p>}

          {book && (
            <>
              {book.coverUrl && (
                <div className="mt-6 overflow-hidden rounded-cloth shadow-sm">
                  {/* eslint-disable-next-line @next/next/no-img-element -- public bucket, dynamic per-book image */}
                  <img src={book.coverUrl} alt="" className="w-full" />
                </div>
              )}
              <h1 className="mt-4 font-display text-3xl">{book.title}</h1>
              {book.authorName && <p className="font-body text-charcoal/60">by {book.authorName}</p>}

              <div className="mt-8 space-y-6">
                {book.pages.map((page) => (
                  <Card key={page.id}>
                    <p className="font-body text-xs font-semibold text-charcoal/40">Page {page.pageNumber}</p>
                    {page.illustrationUrl && (
                      /* eslint-disable-next-line @next/next/no-img-element -- signed URL from a private bucket */
                      <img src={page.illustrationUrl} alt="" className="mt-2 w-full rounded-cloth" />
                    )}
                    <p className="mt-3 whitespace-pre-line font-body text-lg leading-relaxed">{page.text}</p>
                  </Card>
                ))}
              </div>
            </>
          )}
        </div>
      </main>
    </>
  );
}

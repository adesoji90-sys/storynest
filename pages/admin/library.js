import { useEffect, useState } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import { supabaseBrowser } from "@/lib/supabaseBrowserClient";
import AdminHeader from "@/components/AdminHeader";
import BookCover from "@/components/BookCover";
import { Card, Badge, EmptyState } from "@/components/ui";

// A read-only preview of what a family actually sees on /library — NOT
// a redirect there directly, since that page needs family-scoped data
// (children, assignments, printOrdersAllowed) that an admin-only
// account may not have at all, and would error or behave oddly without
// it. This calls the same /api/library endpoint (which already
// tolerates a caller with no family membership, returning
// printOrdersAllowed: false gracefully) but renders it as a simple
// browse view — no assign/print actions, since those genuinely don't
// apply to an admin previewing the catalog.
export default function AdminLibrary() {
  const router = useRouter();
  const [session, setSession] = useState(undefined);
  const [authorized, setAuthorized] = useState(null);
  const [books, setBooks] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    supabaseBrowser.auth.getSession().then(({ data }) => {
      if (!data.session) return router.push("/login?redirect=/admin/library");
      setSession(data.session);
    });
  }, [router]);

  useEffect(() => {
    if (!session) return;
    (async () => {
      const res = await fetch("/api/library", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const data = await res.json();
      if (!res.ok) {
        setAuthorized(false);
        return setError(data.error || "Couldn't load the library.");
      }
      setAuthorized(true);
      setBooks(data.books);
    })();
  }, [session]);

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
      <Head><title>Library preview — Admin</title></Head>
      <main className="min-h-screen bg-ivory_cloth text-charcoal">
        <AdminHeader />
        <div className="mx-auto max-w-3xl px-6 py-10">
          <h1 className="font-display text-3xl">Library</h1>
          <p className="mt-2 font-body text-charcoal/70">
            What families actually see on the public library — a preview, not an editor. Go to Books to manage content.
          </p>
          {books.length === 0 ? (
            <EmptyState title="No published books yet" className="mt-8" />
          ) : (
            <div className="mt-6 space-y-4">
              {books.map((book) => (
                <Card key={book.id} className="flex gap-4">
                  <BookCover coverUrl={book.coverUrl} title={book.title} className="w-20" />
                  <div className="flex-1">
                    <p className="font-body text-lg font-bold">{book.title}</p>
                    {book.authorName && <p className="font-body text-xs text-charcoal/50">by {book.authorName}</p>}
                    {book.subtitle && <p className="font-body text-sm text-charcoal/60">{book.subtitle}</p>}
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {(book.ageRangeMin != null || book.ageRangeMax != null) && (
                        <Badge>Ages {book.ageRangeMin ?? "?"}–{book.ageRangeMax ?? "?"}</Badge>
                      )}
                      {book.readingLevel && <Badge>{book.readingLevel}</Badge>}
                      {book.category && <Badge>{book.category}</Badge>}
                      <Badge>{book._count?.pages ?? "?"} pages</Badge>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      </main>
    </>
  );
}

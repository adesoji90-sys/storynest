import { useEffect, useState } from "react";
import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { supabaseBrowser } from "@/lib/supabaseBrowserClient";

function Badge({ children }) {
  return (
    <span className="rounded-full border border-charcoal/15 px-2 py-0.5 font-body text-xs text-charcoal/60">
      {children}
    </span>
  );
}

export default function Library() {
  const router = useRouter();
  const [session, setSession] = useState(undefined);
  const [books, setBooks] = useState([]);
  const [children, setChildren] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [assigningBookId, setAssigningBookId] = useState(null);
  const [assignedMap, setAssignedMap] = useState({}); // childId -> Set of bookIds

  useEffect(() => {
    async function checkSession() {
      const { data } = await supabaseBrowser.auth.getSession();
      if (!data.session) {
        router.replace("/login?redirect=/library");
        return;
      }
      setSession(data.session);
    }
    checkSession();
  }, [router]);

  useEffect(() => {
    if (!session) return;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const token = session.access_token;
        const [libRes, famRes] = await Promise.all([
          fetch("/api/library", { headers: { Authorization: `Bearer ${token}` } }),
          fetch("/api/family/me", { headers: { Authorization: `Bearer ${token}` } }),
        ]);
        const libData = await libRes.json();
        const famData = await famRes.json();
        if (!libRes.ok) throw new Error(libData.error || "Couldn't load the library.");
        if (!famRes.ok) throw new Error(famData.error || "Couldn't load your family.");
        setBooks(libData.books);
        setChildren(famData.children);

        // Load each child's current assignments so already-assigned books
        // show that instead of an "Assign" button that would just upsert
        // the same assignment again.
        const map = {};
        await Promise.all(
          famData.children.map(async (child) => {
            const res = await fetch(`/api/assignments?childId=${child.id}`, {
              headers: { Authorization: `Bearer ${token}` },
            });
            const data = await res.json();
            map[child.id] = new Set((data.assignments || []).map((a) => a.book.id));
          })
        );
        setAssignedMap(map);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [session]);

  async function handleAssign(bookId, childId) {
    setError("");
    try {
      const res = await fetch("/api/assignments", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ bookId, childId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn't assign the book.");
      setAssignedMap((prev) => ({
        ...prev,
        [childId]: new Set([...(prev[childId] || []), bookId]),
      }));
      setAssigningBookId(null);
    } catch (err) {
      setError(err.message);
    }
  }

  if (session === undefined) return null;

  return (
    <>
      <Head>
        <title>Library — StoryNest</title>
      </Head>
      <main className="min-h-screen bg-ivory_cloth text-charcoal">
        <header className="mx-auto flex max-w-3xl items-center justify-between px-6 py-6">
          <Link href="/" className="font-display text-xl">StoryNest</Link>
          <Link href="/family" className="font-body text-sm text-charcoal/60">Your family →</Link>
        </header>

        <div className="mx-auto max-w-3xl px-6 pb-24">
          <h1 className="font-display text-3xl">Library</h1>
          <p className="mt-2 font-body text-charcoal/70">Pick a book and assign it to a child to start reading.</p>

          {error && <p className="mt-4 font-body text-sm text-coral_ember">{error}</p>}

          {children.length === 0 && !loading && (
            <div className="mt-6 rounded-cloth bg-white p-5 shadow-sm">
              <p className="font-body">
                You don't have any children added yet —{" "}
                <Link href="/family" className="font-semibold text-coral_ember">add one first</Link> before assigning
                books.
              </p>
            </div>
          )}

          {loading ? (
            <p className="mt-8 font-body text-charcoal/50">Loading…</p>
          ) : books.length === 0 ? (
            <p className="mt-8 font-body text-charcoal/50">No books published yet — check back soon.</p>
          ) : (
            <div className="mt-6 space-y-4">
              {books.map((book) => (
                <div key={book.id} className="rounded-cloth bg-white p-5 shadow-sm">
                  <p className="font-body text-lg font-bold">{book.title}</p>
                  {book.subtitle && <p className="font-body text-sm text-charcoal/60">{book.subtitle}</p>}
                  {book.description && <p className="mt-2 font-body text-sm text-charcoal/70">{book.description}</p>}
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {(book.ageRangeMin != null || book.ageRangeMax != null) && (
                      <Badge>Ages {book.ageRangeMin ?? "?"}–{book.ageRangeMax ?? "?"}</Badge>
                    )}
                    {book.readingLevel && <Badge>{book.readingLevel}</Badge>}
                    {book.category && <Badge>{book.category}</Badge>}
                    <Badge>{book._count?.pages ?? "?"} pages</Badge>
                  </div>

                  {children.length > 0 && (
                    <div className="mt-4">
                      {assigningBookId === book.id ? (
                        <div className="flex flex-wrap gap-2">
                          {children.map((child) => {
                            const alreadyAssigned = assignedMap[child.id]?.has(book.id);
                            return (
                              <button
                                key={child.id}
                                disabled={alreadyAssigned}
                                onClick={() => handleAssign(book.id, child.id)}
                                className="rounded-cloth border border-charcoal/15 px-3 py-1.5 font-body text-sm disabled:opacity-40"
                              >
                                {alreadyAssigned ? `✓ ${child.name}` : child.name}
                              </button>
                            );
                          })}
                          <button
                            onClick={() => setAssigningBookId(null)}
                            className="font-body text-sm text-charcoal/40"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setAssigningBookId(book.id)}
                          className="rounded-cloth bg-coral_ember px-4 py-2 font-body text-sm font-bold text-white"
                        >
                          Assign to a child
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </>
  );
}

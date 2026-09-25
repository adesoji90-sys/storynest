import { useEffect, useState } from "react";
import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { supabaseBrowser } from "@/lib/supabaseBrowserClient";
import BookCover from "@/components/BookCover";
import AppHeader from "@/components/AppHeader";
import { Card, Badge, EmptyState } from "@/components/ui";

export default function Library() {
  const router = useRouter();
  const [session, setSession] = useState(undefined);
  const [books, setBooks] = useState([]);
  const [children, setChildren] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [assigningBookId, setAssigningBookId] = useState(null);
  const [printingBookId, setPrintingBookId] = useState(null);
  const [printOrdersAllowed, setPrintOrdersAllowed] = useState(false);
  const [printForm, setPrintForm] = useState({ coverType: "softback", recipientName: "", recipientPhone: "", deliveryAddress: "" });
  const [printSubmitting, setPrintSubmitting] = useState(false);
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
        setPrintOrdersAllowed(libData.printOrdersAllowed ?? false);
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

  const [successMessage, setSuccessMessage] = useState(null); // { bookId, text }

  function showSuccess(bookId, text) {
    setSuccessMessage({ bookId, text });
    setTimeout(() => setSuccessMessage((cur) => (cur?.bookId === bookId ? null : cur)), 2500);
  }

  async function assignOne(bookId, childId) {
    const res = await fetch("/api/assignments", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ bookId, childId }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Couldn't assign the book.");
  }

  async function handleAssign(bookId, childId, childName) {
    setError("");
    try {
      await assignOne(bookId, childId);
      setAssignedMap((prev) => ({
        ...prev,
        [childId]: new Set([...(prev[childId] || []), bookId]),
      }));
      showSuccess(bookId, `Assigned to ${childName}.`);
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleAssignAll(bookId) {
    setError("");
    const targets = children.filter((c) => !assignedMap[c.id]?.has(bookId));
    if (targets.length === 0) return;
    try {
      await Promise.all(targets.map((c) => assignOne(bookId, c.id)));
      setAssignedMap((prev) => {
        const next = { ...prev };
        for (const c of targets) next[c.id] = new Set([...(prev[c.id] || []), bookId]);
        return next;
      });
      showSuccess(bookId, `Assigned to all ${children.length} children.`);
      setAssigningBookId(null);
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleOrderPrint(bookId) {
    setError("");
    if (!printForm.recipientName.trim() || !printForm.recipientPhone.trim() || !printForm.deliveryAddress.trim()) {
      return setError("Fill in a name, phone number, and delivery address.");
    }
    setPrintSubmitting(true);
    try {
      const res = await fetch("/api/print-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ bookId, ...printForm }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn't start the order.");
      // Redirects straight to Paystack's own checkout — "pay
      // immediately upon request" means there's no intermediate review
      // step once the form is submitted.
      window.location.href = data.authorizationUrl;
    } catch (err) {
      setError(err.message);
      setPrintSubmitting(false);
    }
  }

  if (session === undefined) return null;

  return (
    <>
      <Head>
        <title>Library — Derek</title>
      </Head>
      <main className="min-h-screen bg-ivory_cloth text-charcoal">
        <AppHeader />

        <div className="mx-auto max-w-3xl px-6 py-10">
          <h1 className="font-display text-3xl">Library</h1>
          <p className="mt-2 font-body text-charcoal/70">Pick a book and assign it to a child to start reading.</p>

          {error && <p className="mt-4 font-body text-sm text-coral_ember">{error}</p>}

          {children.length === 0 && !loading && (
            <Card className="mt-6">
              <p className="font-body">
                You don't have any children added yet —{" "}
                <Link href="/family" className="font-semibold text-coral_ember">add one first</Link> before assigning
                books.
              </p>
            </Card>
          )}

          {loading ? (
            <p className="mt-8 font-body text-charcoal/50">Loading…</p>
          ) : books.length === 0 ? (
            <EmptyState
              title="No books published yet"
              body="Check back soon — new stories are added to the library regularly."
              className="mt-8"
            />
          ) : (
            <div className="mt-6 space-y-4">
              {books.map((book) => (
                <Card key={book.id} className="flex gap-4">
                  <BookCover coverUrl={book.coverUrl} title={book.title} className="w-24" />
                  <div className="flex-1">
                  <p className="font-body text-lg font-bold">{book.title}</p>
                  {book.authorName && <p className="font-body text-xs text-charcoal/50">by {book.authorName}</p>}
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
                  {book.pdfUrl && (
                    <a
                      href={book.pdfUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-2 inline-block font-body text-sm font-semibold text-indigo_night"
                    >
                      📄 Download print-ready PDF
                    </a>
                  )}

                  {children.length > 0 && (
                    <div className="mt-4">
                      {successMessage?.bookId === book.id && (
                        <p className="mb-2 flex items-center gap-1.5 font-body text-sm font-semibold text-leaf">
                          ✓ {successMessage.text}
                        </p>
                      )}

                      {(() => {
                        const assignedNames = children
                          .filter((c) => assignedMap[c.id]?.has(book.id))
                          .map((c) => c.name);
                        return assignedNames.length > 0 && assigningBookId !== book.id ? (
                          <p className="mb-2 font-body text-sm text-charcoal/60">
                            Assigned to: <span className="font-semibold text-charcoal">{assignedNames.join(", ")}</span>
                          </p>
                        ) : null;
                      })()}

                      {assigningBookId === book.id ? (
                        <div>
                          <p className="font-body text-sm font-semibold text-charcoal/70">Assign to which child?</p>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {children.length > 1 && (
                              <button
                                onClick={() => handleAssignAll(book.id)}
                                className="rounded-cloth border-2 border-coral_ember px-3 py-1.5 font-body text-sm font-bold text-coral_ember"
                              >
                                All children
                              </button>
                            )}
                            {children.map((child) => {
                              const alreadyAssigned = assignedMap[child.id]?.has(book.id);
                              return (
                                <button
                                  key={child.id}
                                  disabled={alreadyAssigned}
                                  onClick={() => handleAssign(book.id, child.id, child.name)}
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
                              Done
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          onClick={() => setAssigningBookId(book.id)}
                          className="rounded-cloth bg-coral_ember px-4 py-2 font-body text-sm font-bold text-white"
                        >
                          Assign to a child
                        </button>
                      )}

                      {printOrdersAllowed && (
                        printingBookId === book.id ? (
                          <div className="mt-3 rounded-cloth bg-ivory_cloth p-4">
                            <p className="font-body text-sm font-semibold">Order a printed copy</p>
                            <p className="mt-1 font-body text-xs text-charcoal/50">Delivered in 4–7 days. Paid immediately.</p>
                            <div className="mt-3 flex gap-2">
                              <button
                                onClick={() => setPrintForm((f) => ({ ...f, coverType: "softback" }))}
                                className={`flex-1 rounded-cloth border-2 px-3 py-2 font-body text-sm font-semibold ${printForm.coverType === "softback" ? "border-coral_ember bg-coral_ember/5" : "border-charcoal/15"}`}
                              >
                                Softback — ₦15,000
                              </button>
                              <button
                                onClick={() => setPrintForm((f) => ({ ...f, coverType: "hardback" }))}
                                className={`flex-1 rounded-cloth border-2 px-3 py-2 font-body text-sm font-semibold ${printForm.coverType === "hardback" ? "border-coral_ember bg-coral_ember/5" : "border-charcoal/15"}`}
                              >
                                Hardback — ₦22,000
                              </button>
                            </div>
                            <input
                              value={printForm.recipientName}
                              onChange={(e) => setPrintForm((f) => ({ ...f, recipientName: e.target.value }))}
                              placeholder="Recipient name"
                              className="mt-3 w-full rounded-cloth border border-charcoal/15 bg-white px-3 py-2 font-body text-sm"
                            />
                            <input
                              value={printForm.recipientPhone}
                              onChange={(e) => setPrintForm((f) => ({ ...f, recipientPhone: e.target.value }))}
                              placeholder="Phone number"
                              className="mt-2 w-full rounded-cloth border border-charcoal/15 bg-white px-3 py-2 font-body text-sm"
                            />
                            <textarea
                              value={printForm.deliveryAddress}
                              onChange={(e) => setPrintForm((f) => ({ ...f, deliveryAddress: e.target.value }))}
                              placeholder="Delivery address"
                              rows={2}
                              className="mt-2 w-full rounded-cloth border border-charcoal/15 bg-white px-3 py-2 font-body text-sm"
                            />
                            <div className="mt-3 flex gap-3">
                              <button
                                onClick={() => handleOrderPrint(book.id)}
                                disabled={printSubmitting}
                                className="rounded-cloth bg-indigo_night px-4 py-2 font-body text-sm font-bold text-ivory_cloth disabled:opacity-50"
                              >
                                {printSubmitting ? "Starting payment…" : "Pay & order"}
                              </button>
                              <button onClick={() => setPrintingBookId(null)} className="font-body text-sm text-charcoal/40">
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button
                            onClick={() => setPrintingBookId(book.id)}
                            className="mt-2 block font-body text-sm font-semibold text-indigo_night"
                          >
                            🖨️ Order a printed copy
                          </button>
                        )
                      )}
                    </div>
                  )}
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

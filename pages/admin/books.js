import { useEffect, useState } from "react";
import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { supabaseBrowser } from "@/lib/supabaseBrowserClient";

const READING_LEVELS = ["Beginner", "Early reader", "Independent", "Fluent"];

function groupByCategory(books) {
  const groups = {};
  for (const book of books) {
    const key = book.category || "Uncategorized";
    if (!groups[key]) groups[key] = [];
    groups[key].push(book);
  }
  return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
}

function StatusPill({ status }) {
  const styles = {
    PUBLISHED: "bg-leaf/15 text-leaf",
    DRAFT: "bg-charcoal/10 text-charcoal/60",
    UNPUBLISHED: "bg-charcoal/10 text-charcoal/60",
    ARCHIVED: "bg-charcoal/10 text-charcoal/40",
  };
  return (
    <span className={`rounded-full px-2 py-0.5 font-body text-xs font-semibold ${styles[status] || styles.DRAFT}`}>
      {status}
    </span>
  );
}

function Badge({ children }) {
  return (
    <span className="rounded-full border border-charcoal/15 px-2 py-0.5 font-body text-xs text-charcoal/60">
      {children}
    </span>
  );
}

function emptyForm() {
  return {
    title: "",
    subtitle: "",
    description: "",
    ageRangeMin: "",
    ageRangeMax: "",
    readingLevel: "",
    category: "",
    lesson: "",
    pages: [""],
  };
}export default function AdminBooks() {
  const router = useRouter();
  const [session, setSession] = useState(undefined);
  const [authorized, setAuthorized] = useState(null); // null = checking, true/false = known
  const [books, setBooks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [theme, setTheme] = useState("");
  const [mode, setMode] = useState(null); // null (undecided) | "manual" | "ai"
  const [pageCount, setPageCount] = useState(10);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    async function checkSession() {
      const { data } = await supabaseBrowser.auth.getSession();
      if (!data.session) {
        router.replace("/login?redirect=/admin/books");
        return;
      }
      setSession(data.session);
    }
    checkSession();
  }, [router]);

  async function loadBooks(token) {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/books", { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (res.status === 403) {
        setAuthorized(false);
        return;
      }
      if (!res.ok) throw new Error(data.error || "Couldn't load books.");
      setAuthorized(true);
      setBooks(data.books);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (session) loadBooks(session.access_token);
  }, [session]);

  function updateField(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
  }
  function updatePage(index, value) {
    setForm((f) => ({ ...f, pages: f.pages.map((p, i) => (i === index ? value : p)) }));
  }
  function addPage() {
    setForm((f) => ({ ...f, pages: [...f.pages, ""] }));
  }
  function removePage(index) {
    setForm((f) => ({ ...f, pages: f.pages.filter((_, i) => i !== index) }));
  }

  async function handleGenerate() {
    if (!theme.trim()) return setError("Describe what the book should be about first.");
    setError("");
    setGenerating(true);
    try {
      const res = await fetch("/api/admin/books/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({
          theme: theme.trim(),
          ageRangeMin: form.ageRangeMin ? Number(form.ageRangeMin) : undefined,
          ageRangeMax: form.ageRangeMax ? Number(form.ageRangeMax) : undefined,
          readingLevel: form.readingLevel || undefined,
          lesson: form.lesson.trim() || undefined,
          category: form.category.trim() || undefined,
          pageCount: Number(pageCount) || 10,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn't generate the story.");
      // Fills the SAME editable fields the manual flow uses — nothing is
      // saved yet, and every field here stays editable before "Create
      // book" actually persists anything, same principle as Section 13's
      // "AI-assisted editing must never automatically publish changes."
      setForm((f) => ({
        ...f,
        title: data.title,
        pages: data.pages.map((p) => p.text),
        ageRangeMin: data.ageRangeMin != null ? String(data.ageRangeMin) : f.ageRangeMin,
        ageRangeMax: data.ageRangeMax != null ? String(data.ageRangeMax) : f.ageRangeMax,
        readingLevel: data.readingLevel || f.readingLevel,
        category: data.category || f.category,
        lesson: data.lesson || f.lesson,
      }));
    } catch (err) {
      setError(err.message);
    } finally {
      setGenerating(false);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    if (!form.title.trim()) return setError("Title is required.");
    if (form.pages.some((p) => !p.trim())) return setError("Every page needs text — remove any empty ones.");

    setSaving(true);
    try {
      const res = await fetch("/api/admin/books", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({
          title: form.title.trim(),
          subtitle: form.subtitle.trim() || undefined,
          description: form.description.trim() || undefined,
          ageRangeMin: form.ageRangeMin ? Number(form.ageRangeMin) : undefined,
          ageRangeMax: form.ageRangeMax ? Number(form.ageRangeMax) : undefined,
          readingLevel: form.readingLevel || undefined,
          category: form.category.trim() || undefined,
          lesson: form.lesson.trim() || undefined,
          pages: form.pages.map((text) => ({ text: text.trim() })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn't create the book.");
      setBooks((prev) => [{ ...data.book, _count: { pages: form.pages.length } }, ...prev]);
      setForm(emptyForm());
      setMode(null);
      setTheme("");
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function togglePublish(book) {
    const nextStatus = book.status === "PUBLISHED" ? "UNPUBLISHED" : "PUBLISHED";
    try {
      const res = await fetch(`/api/admin/books/${book.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ status: nextStatus }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn't update status.");
      setBooks((prev) => prev.map((b) => (b.id === book.id ? { ...b, status: data.book.status } : b)));
    } catch (err) {
      setError(err.message);
    }
  }

  if (session === undefined || authorized === null) return null;

  if (authorized === false) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-ivory_cloth px-6 text-charcoal">
        <div className="max-w-sm text-center">
          <h1 className="font-display text-2xl">Not authorized</h1>
          <p className="mt-2 font-body text-charcoal/70">
            This account doesn't have admin access to the content panel.
          </p>
          <Link href="/account" className="mt-4 inline-block font-body text-sm text-coral_ember">
            ← Back to your account
          </Link>
        </div>
      </main>
    );
  }

  return (
    <>
      <Head>
        <title>Admin — Books</title>
      </Head>
      <main className="min-h-screen bg-ivory_cloth text-charcoal">
        <header className="mx-auto flex max-w-3xl items-center justify-between px-6 py-6">
          <span className="font-display text-xl">StoryNest Admin</span>
          <Link href="/account" className="font-body text-sm text-charcoal/60">← Back to site</Link>
        </header>

        <div className="mx-auto max-w-3xl px-6 pb-24">
          <h1 className="font-display text-3xl">Curated library books</h1>
          <p className="mt-2 font-body text-charcoal/70">
            Text only for now — illustrations are added in a later pass, reusing the same generation pipeline
            Story Studio uses.
          </p>

          {error && <p className="mt-4 font-body text-sm text-coral_ember">{error}</p>}

          <form onSubmit={handleSubmit} className="mt-8 rounded-cloth bg-white p-6 shadow-sm">
            <h2 className="font-display text-xl">New book</h2>

            <p className="mt-3 font-body text-sm text-charcoal/60">How do you want to create this book?</p>
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setMode("manual")}
                className={`rounded-cloth border-2 p-4 text-left font-body ${
                  mode === "manual" ? "border-coral_ember bg-coral_ember/5" : "border-charcoal/15"
                }`}
              >
                <p className="font-bold">Write it myself</p>
                <p className="mt-1 text-sm text-charcoal/60">Type each page's text directly.</p>
              </button>
              <button
                type="button"
                onClick={() => setMode("ai")}
                className={`rounded-cloth border-2 p-4 text-left font-body ${
                  mode === "ai" ? "border-coral_ember bg-coral_ember/5" : "border-charcoal/15"
                }`}
              >
                <p className="font-bold">Generate with AI</p>
                <p className="mt-1 text-sm text-charcoal/60">Describe the theme — AI drafts it, you review and edit.</p>
              </button>
            </div>

            {mode === "ai" && (
              <div className="mt-4 rounded-cloth bg-indigo_night/5 p-4">
                <label className="block font-body font-semibold">What should this book be about?</label>
                <textarea
                  value={theme}
                  onChange={(e) => setTheme(e.target.value)}
                  placeholder="e.g. a shy girl who learns to make friends at a new school"
                  rows={2}
                  className="mt-2 w-full rounded-cloth border border-charcoal/15 bg-white px-4 py-2 font-body"
                />
                <div className="mt-2 flex items-center gap-3">
                  <label className="font-body text-sm">Pages:</label>
                  <input
                    type="number"
                    min={3}
                    max={30}
                    value={pageCount}
                    onChange={(e) => setPageCount(e.target.value)}
                    className="w-20 rounded-cloth border border-charcoal/15 bg-white px-2 py-1 font-body"
                  />
                  <button
                    type="button"
                    onClick={handleGenerate}
                    disabled={generating}
                    className="ml-auto rounded-cloth bg-indigo_night px-4 py-2 font-body text-sm font-bold text-white disabled:opacity-50"
                  >
                    {generating ? "Writing…" : "Generate story"}
                  </button>
                </div>
                <p className="mt-2 font-body text-xs text-charcoal/50">
                  Fills in the title, age range, reading level, category, lesson, and pages below for you to
                  review and edit — nothing is saved until you click "Create book."
                </p>
              </div>
            )}

            {mode && (
              <>
            <label className="mt-4 block font-body font-semibold">Title</label>
            <input
              value={form.title}
              onChange={(e) => updateField("title", e.target.value)}
              className="mt-1 w-full rounded-cloth border border-charcoal/15 bg-white px-4 py-2 font-body"
            />
            <label className="mt-4 block font-body font-semibold">
              Subtitle <span className="font-normal text-charcoal/50">(optional)</span>
            </label>
            <input
              value={form.subtitle}
              onChange={(e) => updateField("subtitle", e.target.value)}
              className="mt-1 w-full rounded-cloth border border-charcoal/15 bg-white px-4 py-2 font-body"
            />
            <label className="mt-4 block font-body font-semibold">
              Description <span className="font-normal text-charcoal/50">(optional)</span>
            </label>
            <textarea
              value={form.description}
              onChange={(e) => updateField("description", e.target.value)}
              rows={2}
              className="mt-1 w-full rounded-cloth border border-charcoal/15 bg-white px-4 py-2 font-body"
            />

            <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div>
                <label className="block font-body text-sm font-semibold">Age min</label>
                <input
                  type="number"
                  value={form.ageRangeMin}
                  onChange={(e) => updateField("ageRangeMin", e.target.value)}
                  className="mt-1 w-full rounded-cloth border border-charcoal/15 bg-white px-3 py-2 font-body"
                />
              </div>
              <div>
                <label className="block font-body text-sm font-semibold">Age max</label>
                <input
                  type="number"
                  value={form.ageRangeMax}
                  onChange={(e) => updateField("ageRangeMax", e.target.value)}
                  className="mt-1 w-full rounded-cloth border border-charcoal/15 bg-white px-3 py-2 font-body"
                />
              </div>
              <div className="col-span-2">
                <label className="block font-body text-sm font-semibold">Reading level</label>
                <select
                  value={form.readingLevel}
                  onChange={(e) => updateField("readingLevel", e.target.value)}
                  className="mt-1 w-full rounded-cloth border border-charcoal/15 bg-white px-3 py-2 font-body"
                >
                  <option value="">Not set</option>
                  {READING_LEVELS.map((l) => (
                    <option key={l} value={l}>{l}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block font-body text-sm font-semibold">
                  Category <span className="font-normal text-charcoal/50">(optional)</span>
                </label>
                <input
                  value={form.category}
                  onChange={(e) => updateField("category", e.target.value)}
                  placeholder="e.g. Bedtime, Adventure"
                  className="mt-1 w-full rounded-cloth border border-charcoal/15 bg-white px-3 py-2 font-body"
                />
              </div>
              <div>
                <label className="block font-body text-sm font-semibold">
                  Lesson <span className="font-normal text-charcoal/50">(optional)</span>
                </label>
                <input
                  value={form.lesson}
                  onChange={(e) => updateField("lesson", e.target.value)}
                  placeholder="e.g. Kindness"
                  className="mt-1 w-full rounded-cloth border border-charcoal/15 bg-white px-3 py-2 font-body"
                />
              </div>
            </div>

            <h3 className="mt-6 font-body font-semibold">Pages</h3>
            {form.pages.map((text, i) => (
              <div key={i} className="mt-2 flex gap-2">
                <textarea
                  value={text}
                  onChange={(e) => updatePage(i, e.target.value)}
                  placeholder={`Page ${i + 1} text`}
                  rows={2}
                  className="w-full rounded-cloth border border-charcoal/15 bg-white px-4 py-2 font-body"
                />
                {form.pages.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removePage(i)}
                    className="font-body text-sm text-charcoal/40"
                  >
                    Remove
                  </button>
                )}
              </div>
            ))}
            <button type="button" onClick={addPage} className="mt-2 font-body text-sm font-semibold text-coral_ember">
              + Add page
            </button>

            <button
              type="submit"
              disabled={saving}
              className="mt-6 w-full rounded-cloth bg-coral_ember px-6 py-3 font-body font-bold text-white disabled:opacity-50"
            >
              {saving ? "Creating…" : "Create book (draft)"}
            </button>
              </>
            )}
          </form>

          <h2 className="mt-10 font-display text-xl">Your library</h2>
          {loading ? (
            <p className="mt-4 font-body text-charcoal/50">Loading…</p>
          ) : books.length === 0 ? (
            <p className="mt-4 font-body text-charcoal/50">No books yet.</p>
          ) : (
            <div className="mt-4 space-y-8">
              {groupByCategory(books).map(([category, categoryBooks]) => (
                <div key={category}>
                  <h3 className="font-body text-sm font-bold uppercase tracking-wide text-charcoal/50">
                    {category} <span className="font-normal normal-case text-charcoal/40">({categoryBooks.length})</span>
                  </h3>
                  <div className="mt-3 space-y-3">
                    {categoryBooks.map((book) => (
                      <div key={book.id} className="flex items-center justify-between rounded-cloth bg-white p-4 shadow-sm">
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-body font-bold">{book.title}</p>
                            <StatusPill status={book.status} />
                          </div>
                          {book.subtitle && <p className="font-body text-sm text-charcoal/60">{book.subtitle}</p>}
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {(book.ageRangeMin != null || book.ageRangeMax != null) && (
                              <Badge>Ages {book.ageRangeMin ?? "?"}–{book.ageRangeMax ?? "?"}</Badge>
                            )}
                            {book.readingLevel && <Badge>{book.readingLevel}</Badge>}
                            {book.lesson && <Badge>{book.lesson}</Badge>}
                            <Badge>{book._count?.pages ?? "?"} pages</Badge>
                          </div>
                        </div>
                        <button
                          onClick={() => togglePublish(book)}
                          className="shrink-0 rounded-cloth border border-charcoal/15 px-4 py-2 font-body text-sm font-semibold"
                        >
                          {book.status === "PUBLISHED" ? "Unpublish" : "Publish"}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </>
  );
}

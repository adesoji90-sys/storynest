import { useEffect, useState } from "react";
import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { supabaseBrowser } from "@/lib/supabaseBrowserClient";
import { enterReadingMode } from "@/lib/readingMode";
import ReadingModePinSetup from "@/components/ReadingModePinSetup";

function calculateAge(dateOfBirth) {
  if (!dateOfBirth) return null;
  const dob = new Date(dateOfBirth);
  const diff = Date.now() - dob.getTime();
  return Math.floor(diff / (365.25 * 24 * 60 * 60 * 1000));
}

function Badge({ children }) {
  return (
    <span className="rounded-full border border-charcoal/15 px-2 py-0.5 font-body text-xs text-charcoal/60">
      {children}
    </span>
  );
}

function ProgressTag({ progress }) {
  if (!progress) return <span className="font-body text-xs text-charcoal/40">Not started</span>;
  if (progress.completedAt) return <span className="font-body text-xs font-semibold text-leaf">✓ Completed</span>;
  return <span className="font-body text-xs text-charcoal/50">{progress.percentage}% read</span>;
}

const READING_LEVELS = ["Beginner", "Early reader", "Independent", "Fluent"];

function LimitModal({ message, onClose }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-charcoal/40 px-6"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-cloth bg-white p-6 text-center shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="font-display text-xl">Plan limit reached</h2>
        <p className="mt-2 font-body text-charcoal/70">{message}</p>
        <div className="mt-6 flex flex-col gap-2">
          <Link
            href="/upgrade"
            className="rounded-cloth bg-coral_ember px-5 py-2.5 font-body font-bold text-white"
          >
            Upgrade to add more →
          </Link>
          <button onClick={onClose} className="font-body text-sm text-charcoal/50">
            Not now
          </button>
        </div>
      </div>
    </div>
  );
}

function ChildForm({ initial, onCancel, onSave, saving }) {
  const [name, setName] = useState(initial?.name || "");
  const [dateOfBirth, setDateOfBirth] = useState(initial?.dateOfBirth ? initial.dateOfBirth.slice(0, 10) : "");
  const [readingLevel, setReadingLevel] = useState(initial?.readingLevel || "");
  const [interests, setInterests] = useState((initial?.interests || []).join(", "));
  const [error, setError] = useState("");

  function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim()) return setError("Name is required.");
    setError("");
    onSave({
      name: name.trim(),
      dateOfBirth: dateOfBirth || null,
      readingLevel: readingLevel || null,
      interests: interests
        .split(",")
        .map((i) => i.trim())
        .filter(Boolean),
    });
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-cloth border border-charcoal/15 bg-white p-5">
      <label className="block font-body font-semibold">Name</label>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="e.g. Amaka"
        className="mt-1 w-full rounded-cloth border border-charcoal/15 bg-white px-4 py-2 font-body"
      />
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <label className="block font-body font-semibold">Date of birth</label>
          <input
            type="date"
            value={dateOfBirth}
            onChange={(e) => setDateOfBirth(e.target.value)}
            className="mt-1 w-full rounded-cloth border border-charcoal/15 bg-white px-4 py-2 font-body"
          />
        </div>
        <div>
          <label className="block font-body font-semibold">Reading level</label>
          <select
            value={readingLevel}
            onChange={(e) => setReadingLevel(e.target.value)}
            className="mt-1 w-full rounded-cloth border border-charcoal/15 bg-white px-4 py-2 font-body"
          >
            <option value="">Not sure yet</option>
            {READING_LEVELS.map((l) => (
              <option key={l} value={l}>{l}</option>
            ))}
          </select>
        </div>
      </div>
      <label className="mt-4 block font-body font-semibold">
        Interests <span className="font-normal text-charcoal/50">(comma-separated)</span>
      </label>
      <input
        value={interests}
        onChange={(e) => setInterests(e.target.value)}
        placeholder="e.g. dinosaurs, football, space"
        className="mt-1 w-full rounded-cloth border border-charcoal/15 bg-white px-4 py-2 font-body"
      />
      {error && <p className="mt-2 font-body text-sm text-coral_ember">{error}</p>}
      <div className="mt-5 flex gap-3">
        <button
          type="submit"
          disabled={saving}
          className="rounded-cloth bg-coral_ember px-5 py-2 font-body font-bold text-white disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save"}
        </button>
        <button type="button" onClick={onCancel} className="font-body text-sm text-charcoal/60">
          Cancel
        </button>
      </div>
    </form>
  );
}

export default function Family() {
  const router = useRouter();
  const [session, setSession] = useState(undefined);
  const [children, setChildren] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [assignmentsByChild, setAssignmentsByChild] = useState({}); // childId -> assignment[]
  const [limitModalMessage, setLimitModalMessage] = useState(null);
  const [hasReadingModePin, setHasReadingModePin] = useState(null); // null = unknown yet
  const [pendingReadingModeChildId, setPendingReadingModeChildId] = useState(null);

  useEffect(() => {
    async function checkSession() {
      const { data } = await supabaseBrowser.auth.getSession();
      if (!data.session) {
        router.replace("/login?redirect=/family");
        return;
      }
      setSession(data.session);
    }
    checkSession();
  }, [router]);

  async function loadChildren(token) {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/family/me", { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn't load your family.");
      setChildren(data.children);

      const map = {};
      await Promise.all(
        data.children.map(async (child) => {
          const r = await fetch(`/api/assignments?childId=${child.id}`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          const d = await r.json();
          map[child.id] = d.assignments || [];
        })
      );
      setAssignmentsByChild(map);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (session) loadChildren(session.access_token);
  }, [session]);

  useEffect(() => {
    if (!session) return;
    fetch("/api/family/reading-mode-pin", { headers: { Authorization: `Bearer ${session.access_token}` } })
      .then((r) => r.json())
      .then((data) => setHasReadingModePin(!!data.hasPin))
      .catch(() => setHasReadingModePin(false));
  }, [session]);

  function handleStartReadingMode(childId) {
    if (hasReadingModePin) {
      enterReadingMode(childId);
      router.push("/reading-mode");
    } else {
      // No PIN set yet -- this is the only place in the app that flow
      // can be reached from, deliberately: it's still the parent-facing
      // /family page, never anything inside Reading Mode itself.
      setPendingReadingModeChildId(childId);
    }
  }

  async function handleAdd(payload) {
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/children", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.code === "PLAN_LIMIT_REACHED") {
          setLimitModalMessage(data.error);
          return;
        }
        throw new Error(data.error || "Couldn't add child.");
      }
      setChildren((prev) => [...prev, data.child]);
      setAdding(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdate(id, payload) {
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/children/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn't update child.");
      setChildren((prev) => prev.map((c) => (c.id === id ? data.child : c)));
      setEditingId(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove(id, name) {
    if (!window.confirm(`Remove ${name} from your family? Their reading history is kept, not deleted.`)) return;
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/children/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ active: false }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn't remove child.");
      setChildren((prev) => prev.filter((c) => c.id !== id));
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (session === undefined) return null;

  return (
    <>
      <Head>
        <title>Your family — StoryNest</title>
      </Head>
      <main className="min-h-screen bg-ivory_cloth text-charcoal">
        <header className="mx-auto flex max-w-3xl items-center justify-between px-6 py-6">
          <Link href="/" className="font-display text-xl">StoryNest</Link>
          <div className="flex items-center gap-5">
            <Link href="/library" className="font-body text-sm text-charcoal/60">Library</Link>
            <Link href="/story-studio" className="font-body text-sm text-charcoal/60">Story Studio</Link>
            <Link href="/account" className="font-body text-sm text-charcoal/60">My Library →</Link>
          </div>
        </header>

        <div className="mx-auto max-w-3xl px-6 pb-24">
          <h1 className="font-display text-3xl">Your family</h1>
          <p className="mt-2 font-body text-charcoal/70">
            Add each child who'll be reading — their own profile, their own reading progress.
          </p>

          {error && <p className="mt-4 font-body text-sm text-coral_ember">{error}</p>}

          {loading ? (
            <p className="mt-8 font-body text-charcoal/50">Loading…</p>
          ) : (
            <div className="mt-8 space-y-4">
              {children.map((child) => {
                const age = calculateAge(child.dateOfBirth);
                return (
                  <div key={child.id}>
                    {editingId === child.id ? (
                      <ChildForm
                        initial={child}
                        saving={saving}
                        onCancel={() => setEditingId(null)}
                        onSave={(payload) => handleUpdate(child.id, payload)}
                      />
                    ) : (
                      <div className="rounded-cloth bg-white p-5 shadow-sm">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-body font-bold">
                              {child.name}
                              {age !== null && <span className="font-normal text-charcoal/50"> · age {age}</span>}
                            </p>
                            <p className="mt-1 font-body text-sm text-charcoal/60">
                              {child.readingLevel || "Reading level not set"}
                              {child.interests?.length > 0 && ` · ${child.interests.join(", ")}`}
                            </p>
                          </div>
                          <div className="flex gap-4">
                            <button
                              onClick={() => setEditingId(child.id)}
                              className="font-body text-sm font-semibold text-coral_ember"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => handleRemove(child.id, child.name)}
                              className="font-body text-sm text-charcoal/40"
                            >
                              Remove
                            </button>
                          </div>
                        </div>

                        <div className="mt-4 border-t border-charcoal/10 pt-3">
                          {(assignmentsByChild[child.id] || []).length === 0 ? (
                            <p className="font-body text-sm text-charcoal/50">
                              No books assigned yet —{" "}
                              <Link href="/library" className="font-semibold text-coral_ember">browse the library</Link>.
                            </p>
                          ) : (
                            <>
                              <button
                                onClick={() => handleStartReadingMode(child.id)}
                                className="mb-3 w-full rounded-cloth bg-indigo_night px-4 py-2.5 font-body font-bold text-white"
                              >
                                📖 Start Reading Mode for {child.name}
                              </button>
                              <div className="space-y-2">
                              {assignmentsByChild[child.id].map((a) => (
                                <Link
                                  key={a.id}
                                  href={`/read/${a.book.id}?childId=${child.id}`}
                                  className="block rounded-cloth px-2 py-2 hover:bg-ivory_cloth"
                                >
                                  <div className="flex items-center justify-between">
                                    <span className="font-body text-sm font-semibold">{a.book.title}</span>
                                    <span className="font-body text-sm text-coral_ember">Read →</span>
                                  </div>
                                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                                    {(a.book.ageRangeMin != null || a.book.ageRangeMax != null) && (
                                      <Badge>Ages {a.book.ageRangeMin ?? "?"}–{a.book.ageRangeMax ?? "?"}</Badge>
                                    )}
                                    {a.book.readingLevel && <Badge>{a.book.readingLevel}</Badge>}
                                    {a.book.category && <Badge>{a.book.category}</Badge>}
                                    <Badge>{a.book._count?.pages ?? "?"} pages</Badge>
                                    <ProgressTag progress={a.progress} />
                                  </div>
                                </Link>
                              ))}
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}

              {adding ? (
                <ChildForm saving={saving} onCancel={() => setAdding(false)} onSave={handleAdd} />
              ) : (
                <button
                  onClick={() => setAdding(true)}
                  className="w-full rounded-cloth border-2 border-dashed border-charcoal/20 py-4 font-body font-semibold text-charcoal/60"
                >
                  + Add a child
                </button>
              )}
            </div>
          )}
        </div>
      </main>
      {limitModalMessage && (
        <LimitModal message={limitModalMessage} onClose={() => setLimitModalMessage(null)} />
      )}
      {pendingReadingModeChildId && (
        <ReadingModePinSetup
          accessToken={session.access_token}
          onCancel={() => setPendingReadingModeChildId(null)}
          onSuccess={() => {
            setHasReadingModePin(true);
            enterReadingMode(pendingReadingModeChildId);
            router.push("/reading-mode");
          }}
        />
      )}
    </>
  );
}

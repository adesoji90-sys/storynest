import { useEffect, useState } from "react";
import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { supabaseBrowser } from "@/lib/supabaseBrowserClient";

function calculateAge(dateOfBirth) {
  if (!dateOfBirth) return null;
  const dob = new Date(dateOfBirth);
  const diff = Date.now() - dob.getTime();
  return Math.floor(diff / (365.25 * 24 * 60 * 60 * 1000));
}

const READING_LEVELS = ["Beginner", "Early reader", "Independent", "Fluent"];

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
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (session) loadChildren(session.access_token);
  }, [session]);

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
      if (!res.ok) throw new Error(data.error || "Couldn't add child.");
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
          <Link href="/account" className="font-body text-sm text-charcoal/60">My Library →</Link>
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
                      <div className="flex items-center justify-between rounded-cloth bg-white p-5 shadow-sm">
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
    </>
  );
}

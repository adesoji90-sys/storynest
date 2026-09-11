import { useEffect, useState } from "react";
import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { supabaseBrowser } from "@/lib/supabaseBrowserClient";

export default function StoryStudio() {
  const router = useRouter();
  const [session, setSession] = useState(undefined);
  const [children, setChildren] = useState([]);
  const [inProgress, setInProgress] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [phase, setPhase] = useState("brief");
  const [storyId, setStoryId] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);

  const [childId, setChildId] = useState("");
  const [theme, setTheme] = useState("");
  const [lesson, setLesson] = useState("");
  const [genre, setGenre] = useState("");
  const [setting, setSetting] = useState("");
  const [pageCount, setPageCount] = useState(8);
  const [parentInstructions, setParentInstructions] = useState("");

  const [draftTitle, setDraftTitle] = useState("");
  const [draftPages, setDraftPages] = useState([]);
  const [publishedBookId, setPublishedBookId] = useState(null);

  useEffect(() => {
    async function checkSession() {
      const { data } = await supabaseBrowser.auth.getSession();
      if (!data.session) {
        router.replace("/login?redirect=/story-studio");
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
        const [famRes, storiesRes] = await Promise.all([
          fetch("/api/family/me", { headers: { Authorization: `Bearer ${token}` } }),
          fetch("/api/story-studio", { headers: { Authorization: `Bearer ${token}` } }),
        ]);
        const famData = await famRes.json();
        const storiesData = await storiesRes.json();
        if (!famRes.ok) throw new Error(famData.error || "Couldn't load your family.");
        if (!storiesRes.ok) throw new Error(storiesData.error || "Couldn't load your stories.");
        setChildren(famData.children);
        setInProgress(storiesData.stories);
        if (famData.children.length > 0) setChildId(famData.children[0].id);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [session]);

  async function handleStartAndGenerate(e) {
    e.preventDefault();
    if (!childId) return setError("Add a child first, or pick one above.");
    if (!theme.trim()) return setError("Describe what the story should be about.");
    setError("");
    setGenerating(true);
    try {
      const token = session.access_token;
      const startRes = await fetch("/api/story-studio", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          childId,
          theme: theme.trim(),
          lesson: lesson.trim() || undefined,
          genre: genre.trim() || undefined,
          setting: setting.trim() || undefined,
          pageCount: Number(pageCount) || 8,
          parentInstructions: parentInstructions.trim() || undefined,
        }),
      });
      const startData = await startRes.json();
      if (!startRes.ok) throw new Error(startData.error || "Couldn't start the story.");

      await generateForStory(startData.storyId, token);
      setStoryId(startData.storyId);
    } catch (err) {
      setError(err.message);
    } finally {
      setGenerating(false);
    }
  }

  async function generateForStory(id, token) {
    const res = await fetch(`/api/story-studio/${id}/generate`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Couldn't generate the story.");
    setDraftTitle(data.title);
    setDraftPages(data.pages.map((p) => p.text));
    setPhase("reviewing");
  }

  async function handleRegenerate() {
    setError("");
    setGenerating(true);
    try {
      await generateForStory(storyId, session.access_token);
    } catch (err) {
      setError(err.message);
    } finally {
      setGenerating(false);
    }
  }

  async function handleResume(story) {
    const latest = story.versions[0];
    if (!latest) return;
    setStoryId(story.id);
    setDraftTitle(latest.title);
    setDraftPages(latest.pagesJson.map((p) => p.text));
    setPhase("reviewing");
  }

  function updatePage(index, value) {
    setDraftPages((prev) => prev.map((p, i) => (i === index ? value : p)));
  }

  async function handleApprove() {
    if (draftPages.some((p) => !p.trim())) return setError("Every page needs text — remove any empty ones.");
    setError("");
    setSaving(true);
    try {
      const res = await fetch(`/api/story-studio/${storyId}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ title: draftTitle, pages: draftPages.map((text) => ({ text })) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn't approve the story.");
      setPublishedBookId(data.bookId);
      setPhase("done");
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
        <title>Story Studio — StoryNest</title>
      </Head>
      <main className="min-h-screen bg-ivory_cloth text-charcoal">
        <header className="mx-auto flex max-w-3xl items-center justify-between px-6 py-6">
          <Link href="/" className="font-display text-xl">StoryNest</Link>
          <Link href="/family" className="font-body text-sm text-charcoal/60">Your family →</Link>
        </header>

        <div className="mx-auto max-w-3xl px-6 pb-24">
          <h1 className="font-display text-3xl">Story Studio</h1>
          <p className="mt-2 font-body text-charcoal/70">Write a personalized story starring your own child.</p>

          {error && <p className="mt-4 font-body text-sm text-coral_ember">{error}</p>}

          {loading ? (
            <p className="mt-8 font-body text-charcoal/50">Loading…</p>
          ) : children.length === 0 ? (
            <div className="mt-6 rounded-cloth bg-white p-5 shadow-sm">
              <p className="font-body">
                Add a child first — <Link href="/family" className="font-semibold text-coral_ember">go to your family</Link>.
              </p>
            </div>
          ) : phase === "done" ? (
            <div className="mt-8 rounded-cloth bg-white p-6 text-center shadow-sm">
              <p className="font-display text-2xl">🎉 Published!</p>
              <p className="mt-2 font-body text-charcoal/70">"{draftTitle}" is ready to read.</p>
              <Link href="/family" className="mt-4 inline-block rounded-cloth bg-coral_ember px-5 py-2.5 font-body font-bold text-white">
                Go read it →
              </Link>
            </div>
          ) : phase === "reviewing" ? (
            <div className="mt-8 rounded-cloth bg-white p-6 shadow-sm">
              <h2 className="font-display text-xl">Review the story</h2>
              <p className="mt-1 font-body text-sm text-charcoal/60">
                Edit anything you'd like, or regenerate for a different attempt — nothing is saved until you approve.
              </p>
              <label className="mt-4 block font-body font-semibold">Title</label>
              <input
                value={draftTitle}
                onChange={(e) => setDraftTitle(e.target.value)}
                className="mt-1 w-full rounded-cloth border border-charcoal/15 bg-white px-4 py-2 font-body"
              />
              <h3 className="mt-6 font-body font-semibold">Pages</h3>
              {draftPages.map((text, i) => (
                <textarea
                  key={i}
                  value={text}
                  onChange={(e) => updatePage(i, e.target.value)}
                  rows={2}
                  className="mt-2 w-full rounded-cloth border border-charcoal/15 bg-white px-4 py-2 font-body"
                />
              ))}
              <div className="mt-6 flex flex-wrap gap-3">
                <button
                  onClick={handleApprove}
                  disabled={saving || generating}
                  className="rounded-cloth bg-coral_ember px-6 py-3 font-body font-bold text-white disabled:opacity-50"
                >
                  {saving ? "Publishing…" : "Approve & publish"}
                </button>
                <button
                  onClick={handleRegenerate}
                  disabled={saving || generating}
                  className="rounded-cloth border border-charcoal/15 px-6 py-3 font-body font-semibold disabled:opacity-50"
                >
                  {generating ? "Writing…" : "Regenerate"}
                </button>
                <button
                  onClick={() => setPhase("brief")}
                  disabled={saving || generating}
                  className="font-body text-sm text-charcoal/40"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <>
              <form onSubmit={handleStartAndGenerate} className="mt-8 rounded-cloth bg-white p-6 shadow-sm">
                <h2 className="font-display text-xl">New story</h2>
                <label className="mt-4 block font-body font-semibold">Who's this story for?</label>
                <select
                  value={childId}
                  onChange={(e) => setChildId(e.target.value)}
                  className="mt-1 w-full rounded-cloth border border-charcoal/15 bg-white px-4 py-2 font-body"
                >
                  {children.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
                <label className="mt-4 block font-body font-semibold">What should the story be about?</label>
                <textarea
                  value={theme}
                  onChange={(e) => setTheme(e.target.value)}
                  placeholder="e.g. overcoming a fear of the dark"
                  rows={2}
                  className="mt-1 w-full rounded-cloth border border-charcoal/15 bg-white px-4 py-2 font-body"
                />
                <div className="mt-4 grid gap-4 sm:grid-cols-3">
                  <div>
                    <label className="block font-body text-sm font-semibold">Genre</label>
                    <input
                      value={genre}
                      onChange={(e) => setGenre(e.target.value)}
                      placeholder="e.g. Adventure"
                      className="mt-1 w-full rounded-cloth border border-charcoal/15 bg-white px-3 py-2 font-body"
                    />
                  </div>
                  <div>
                    <label className="block font-body text-sm font-semibold">Setting</label>
                    <input
                      value={setting}
                      onChange={(e) => setSetting(e.target.value)}
                      placeholder="e.g. a village market"
                      className="mt-1 w-full rounded-cloth border border-charcoal/15 bg-white px-3 py-2 font-body"
                    />
                  </div>
                  <div>
                    <label className="block font-body text-sm font-semibold">Pages</label>
                    <input
                      type="number"
                      min={3}
                      max={30}
                      value={pageCount}
                      onChange={(e) => setPageCount(e.target.value)}
                      className="mt-1 w-full rounded-cloth border border-charcoal/15 bg-white px-3 py-2 font-body"
                    />
                  </div>
                </div>
                <label className="mt-4 block font-body font-semibold">
                  Lesson <span className="font-normal text-charcoal/50">(optional)</span>
                </label>
                <input
                  value={lesson}
                  onChange={(e) => setLesson(e.target.value)}
                  placeholder="e.g. Sharing"
                  className="mt-1 w-full rounded-cloth border border-charcoal/15 bg-white px-4 py-2 font-body"
                />
                <label className="mt-4 block font-body font-semibold">
                  Anything else? <span className="font-normal text-charcoal/50">(optional)</span>
                </label>
                <textarea
                  value={parentInstructions}
                  onChange={(e) => setParentInstructions(e.target.value)}
                  rows={2}
                  className="mt-1 w-full rounded-cloth border border-charcoal/15 bg-white px-4 py-2 font-body"
                />
                <button
                  type="submit"
                  disabled={generating}
                  className="mt-6 w-full rounded-cloth bg-coral_ember px-6 py-3 font-body font-bold text-white disabled:opacity-50"
                >
                  {generating ? "Writing…" : "Generate story"}
                </button>
              </form>

              {inProgress.length > 0 && (
                <div className="mt-8">
                  <h2 className="font-display text-xl">Continue an in-progress story</h2>
                  <div className="mt-3 space-y-2">
                    {inProgress.map((story) => (
                      <button
                        key={story.id}
                        onClick={() => handleResume(story)}
                        className="flex w-full items-center justify-between rounded-cloth bg-white p-4 text-left shadow-sm"
                      >
                        <span className="font-body">
                          {story.versions[0]?.title || "Untitled"} — for {story.child.name}
                        </span>
                        <span className="font-body text-sm text-coral_ember">Continue →</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </>
  );
}

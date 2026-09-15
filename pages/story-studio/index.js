import { useEffect, useState } from "react";
import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { supabaseBrowser } from "@/lib/supabaseBrowserClient";
import AppHeader from "@/components/AppHeader";

export default function StoryStudio() {
  const router = useRouter();
  const [session, setSession] = useState(undefined);
  const [children, setChildren] = useState([]);
  const [inProgress, setInProgress] = useState([]);
  const [customBooksAllowed, setCustomBooksAllowed] = useState(true); // optimistic default while loading — the real check is server-side regardless
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [phase, setPhase] = useState("brief");
  const [storyId, setStoryId] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);

  const [childId, setChildId] = useState("");
  const [characters, setCharacters] = useState([]);
  const [characterMode, setCharacterMode] = useState("none"); // "none" (auto), "existing" (pick one), "new" (create one)
  const [selectedCharacterId, setSelectedCharacterId] = useState("");
  const [charName, setCharName] = useState("");
  const [charGender, setCharGender] = useState("unspecified");
  const [charAppearance, setCharAppearance] = useState("");
  const [charHair, setCharHair] = useState("");
  const [charSkinTone, setCharSkinTone] = useState("");
  const [charClothing, setCharClothing] = useState("");
  const [charPersonality, setCharPersonality] = useState("");
  const [theme, setTheme] = useState("");
  const [lesson, setLesson] = useState("");
  const [genre, setGenre] = useState("");
  const [setting, setSetting] = useState("");
  const [pageCount, setPageCount] = useState(8);
  const [parentInstructions, setParentInstructions] = useState("");

  const [draftTitle, setDraftTitle] = useState("");
  const [authorName, setAuthorName] = useState("");
  const [draftPages, setDraftPages] = useState([]);
  const [draftQuestions, setDraftQuestions] = useState(["", "", ""]);
  const [publishedBookId, setPublishedBookId] = useState(null);
  const [illustrating, setIllustrating] = useState(false);
  const [illustrateDone, setIllustrateDone] = useState(false);
  const [illustrateError, setIllustrateError] = useState("");
  const [narrating, setNarrating] = useState(false);
  const [narrateDone, setNarrateDone] = useState(false);
  const [narrateError, setNarrateError] = useState("");
  const [narrationTone, setNarrationTone] = useState("gentle");

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
        const [famRes, storiesRes, charRes] = await Promise.all([
          fetch("/api/family/me", { headers: { Authorization: `Bearer ${token}` } }),
          fetch("/api/story-studio", { headers: { Authorization: `Bearer ${token}` } }),
          fetch("/api/characters", { headers: { Authorization: `Bearer ${token}` } }),
        ]);
        const famData = await famRes.json();
        const storiesData = await storiesRes.json();
        const charData = await charRes.json();
        if (!famRes.ok) throw new Error(famData.error || "Couldn't load your family.");
        if (!storiesRes.ok) throw new Error(storiesData.error || "Couldn't load your stories.");
        setChildren(famData.children);
        setInProgress(storiesData.stories);
        setCustomBooksAllowed(storiesData.customBooksAllowed ?? true);
        setCharacters(charRes.ok ? charData.characters : []);
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
    if (characterMode === "existing" && !selectedCharacterId) return setError("Pick a character, or choose a different option.");
    if (characterMode === "new" && !charName.trim()) return setError("Give your new character a name.");
    setError("");
    setGenerating(true);
    try {
      const token = session.access_token;

      // Resolved to a real characterId BEFORE starting the story, so
      // it can be linked via BookCharacter at creation time — this is
      // what lets illustrate.ts check for an explicitly-chosen
      // character first, instead of always auto-deriving one from the
      // child (the old behavior that caused a story about, say, a
      // pregnant woman to keep reusing whatever generic child
      // appearance was cached from an earlier, unrelated story).
      let characterId;
      if (characterMode === "existing") {
        characterId = selectedCharacterId;
      } else if (characterMode === "new") {
        const charRes = await fetch("/api/characters", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            name: charName.trim(),
            childId,
            gender: charGender !== "unspecified" ? charGender : undefined,
            appearance: charAppearance.trim() || undefined,
            hair: charHair.trim() || undefined,
            skinTone: charSkinTone.trim() || undefined,
            clothing: charClothing.trim() || undefined,
            personality: charPersonality.trim() || undefined,
          }),
        });
        const charData = await charRes.json();
        if (!charRes.ok) throw new Error(charData.error || "Couldn't create the character.");
        characterId = charData.character.id;
        setCharacters((prev) => [charData.character, ...prev]);
      }
      // characterMode === "none" leaves characterId undefined —
      // /api/story-studio falls back to auto-creating a default
      // character from the child, same as before this feature existed.

      const startRes = await fetch("/api/story-studio", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          childId,
          characterId,
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
    setDraftQuestions(data.questions && data.questions.length === 3 ? data.questions : ["", "", ""]);
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
    // pagesJson's shape changed to { pages, questions } when this
    // feature was added — old() versions saved before that change
    // would have a bare array here instead, so this falls back to
    // treating pagesJson itself as the pages array in that case rather
    // than crashing on a resume of a story started before this shipped.
    const pagesData = Array.isArray(latest.pagesJson) ? latest.pagesJson : latest.pagesJson.pages;
    const questionsData = Array.isArray(latest.pagesJson) ? [] : latest.pagesJson.questions;
    setDraftPages(pagesData.map((p) => p.text));
    setDraftQuestions(questionsData && questionsData.length === 3 ? questionsData : ["", "", ""]);
    setPhase("reviewing");
  }

  function updatePage(index, value) {
    setDraftPages((prev) => prev.map((p, i) => (i === index ? value : p)));
  }

  function updateQuestion(index, value) {
    setDraftQuestions((prev) => prev.map((q, i) => (i === index ? value : q)));
  }

  async function handleApprove() {
    if (draftPages.some((p) => !p.trim())) return setError("Every page needs text — remove any empty ones.");
    setError("");
    setSaving(true);
    try {
      // The questions page and closing page are flattened into the same
      // "pages" array approve.ts already expects — they're real,
      // regular Page rows once saved, not a separate concept the
      // backend needs to know about. Only added if at least one
      // question was actually filled in, so a story where all three
      // were cleared doesn't end with an empty "Let's talk about the
      // story!" page with nothing under it.
      const finalPages = [...draftPages.map((text) => ({ text }))];
      const filledQuestions = draftQuestions.map((q) => q.trim()).filter(Boolean);
      if (filledQuestions.length > 0) {
        finalPages.push({
          text: `Let's talk about the story!\n\n${filledQuestions.map((q, i) => `${i + 1}. ${q}`).join("\n")}`,
        });
      }
      finalPages.push({
        text: "The End 🎉\n\nWant more stories like this one? There's a whole world of adventures waiting in your StoryNest library!",
      });

      const res = await fetch(`/api/story-studio/${storyId}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ title: draftTitle, authorName: authorName.trim() || undefined, pages: finalPages }),
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

  async function handleIllustrate() {
    setIllustrateError("");
    setIllustrating(true);
    try {
      const res = await fetch(`/api/books/${publishedBookId}/illustrate`, {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn't illustrate the book.");
      setIllustrateDone(true);
    } catch (err) {
      setIllustrateError(err.message);
    } finally {
      setIllustrating(false);
    }
  }

  async function handleNarrate() {
    setNarrateError("");
    setNarrating(true);
    try {
      const res = await fetch(`/api/books/${publishedBookId}/narrate`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ tone: narrationTone }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn't narrate the book.");
      setNarrateDone(true);
    } catch (err) {
      setNarrateError(err.message);
    } finally {
      setNarrating(false);
    }
  }

  if (session === undefined) return null;

  return (
    <>
      <Head>
        <title>Story Studio — StoryNest</title>
      </Head>
      <main className="min-h-screen bg-ivory_cloth text-charcoal">
        <AppHeader />

        <div className="mx-auto max-w-3xl px-6 py-10">
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
          ) : !customBooksAllowed ? (
            <div className="mt-6 rounded-cloth bg-white p-6 text-center shadow-sm">
              <p className="font-display text-xl">Create your own stories with the Family plan</p>
              <p className="mt-2 font-body text-charcoal/70">
                Your current plan includes the full library — reading and listening are still fully available.
                Writing your own personalized stories, starring your own child, needs the Family plan.
              </p>
              <Link
                href="/upgrade"
                className="mt-4 inline-block rounded-cloth bg-coral_ember px-6 py-3 font-body font-bold text-white"
              >
                See the Family plan →
              </Link>
            </div>
          ) : phase === "done" ? (
            <div className="mt-8 rounded-cloth bg-white p-6 text-center shadow-sm">
              <p className="font-display text-2xl">🎉 Published!</p>
              <p className="mt-2 font-body text-charcoal/70">"{draftTitle}" is ready to read.</p>

              {illustrateError && <p className="mt-3 font-body text-sm text-coral_ember">{illustrateError}</p>}

              {illustrateDone ? (
                <p className="mt-4 font-body font-semibold text-leaf">✓ Illustrated!</p>
              ) : (
                <button
                  onClick={handleIllustrate}
                  disabled={illustrating}
                  className="mt-4 w-full rounded-cloth bg-indigo_night px-5 py-2.5 font-body font-bold text-white disabled:opacity-50"
                >
                  {illustrating ? "Illustrating… this can take a minute" : "🎨 Illustrate this book"}
                </button>
              )}

              {narrateError && <p className="mt-3 font-body text-sm text-coral_ember">{narrateError}</p>}

              {narrateDone ? (
                <p className="mt-3 font-body font-semibold text-leaf">✓ Narrated!</p>
              ) : (
                <>
                  <p className="mt-3 font-body text-xs font-semibold text-charcoal/50">Narration voice</p>
                  <div className="mt-1 grid grid-cols-3 gap-2">
                    {[
                      { id: "gentle", label: "Warm & Gentle" },
                      { id: "bright", label: "Bright & Energetic" },
                      { id: "classic", label: "Classic Storyteller" },
                    ].map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setNarrationTone(t.id)}
                        className={`rounded-cloth border-2 px-2 py-2 font-body text-xs font-semibold ${narrationTone === t.id ? "border-indigo_night bg-indigo_night/5" : "border-charcoal/15"}`}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={handleNarrate}
                    disabled={narrating}
                    className="mt-2 w-full rounded-cloth border-2 border-indigo_night px-5 py-2.5 font-body font-bold text-indigo_night disabled:opacity-50"
                  >
                    {narrating ? "Narrating… this can take a minute" : "🔊 Add narration"}
                  </button>
                </>
              )}

              <Link
                href={`/read/${publishedBookId}?childId=${childId}`}
                className="mt-3 inline-block font-body text-sm font-semibold text-coral_ember"
              >
                {illustrateDone ? "Go read it →" : "Skip for now, go read it →"}
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
              <label className="mt-4 block font-body font-semibold">
                Author <span className="font-normal text-charcoal/50">(optional)</span>
              </label>
              <input
                value={authorName}
                onChange={(e) => setAuthorName(e.target.value)}
                placeholder="e.g. Mummy Ada"
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

              <h3 className="mt-6 font-body font-semibold">
                Questions about the story <span className="font-normal text-charcoal/50">(shown on their own page at the end)</span>
              </h3>
              {draftQuestions.map((q, i) => (
                <input
                  key={i}
                  value={q}
                  onChange={(e) => updateQuestion(i, e.target.value)}
                  placeholder={`Question ${i + 1}`}
                  className="mt-2 w-full rounded-cloth border border-charcoal/15 bg-white px-4 py-2 font-body text-sm"
                />
              ))}
              <p className="mt-1 font-body text-xs text-charcoal/50">
                Leave all three blank to skip this page. A final "The End" page — with a little nudge toward reading more — is always added after.
              </p>

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

                <label className="mt-4 block font-body font-semibold">Character</label>
                <div className="mt-1 grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setCharacterMode("none")}
                    className={`rounded-cloth border-2 px-2 py-2 font-body text-xs font-semibold ${characterMode === "none" ? "border-coral_ember bg-coral_ember/5" : "border-charcoal/15"}`}
                  >
                    Default
                  </button>
                  <button
                    type="button"
                    onClick={() => setCharacterMode("existing")}
                    disabled={characters.length === 0}
                    className={`rounded-cloth border-2 px-2 py-2 font-body text-xs font-semibold disabled:opacity-30 ${characterMode === "existing" ? "border-coral_ember bg-coral_ember/5" : "border-charcoal/15"}`}
                  >
                    Choose existing
                  </button>
                  <button
                    type="button"
                    onClick={() => setCharacterMode("new")}
                    className={`rounded-cloth border-2 px-2 py-2 font-body text-xs font-semibold ${characterMode === "new" ? "border-coral_ember bg-coral_ember/5" : "border-charcoal/15"}`}
                  >
                    Create new
                  </button>
                </div>

                {characterMode === "existing" && (
                  <select
                    value={selectedCharacterId}
                    onChange={(e) => setSelectedCharacterId(e.target.value)}
                    className="mt-2 w-full rounded-cloth border border-charcoal/15 bg-white px-4 py-2 font-body text-sm"
                  >
                    <option value="">Pick a character…</option>
                    {characters.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}{c.child ? ` (${c.child.name})` : ""}
                      </option>
                    ))}
                  </select>
                )}

                {characterMode === "new" && (
                  <div className="mt-2 rounded-cloth bg-ivory_cloth p-4">
                    <input
                      value={charName}
                      onChange={(e) => setCharName(e.target.value)}
                      placeholder="Character name"
                      className="w-full rounded-cloth border border-charcoal/15 bg-white px-3 py-2 font-body text-sm"
                    />
                    <select
                      value={charGender}
                      onChange={(e) => setCharGender(e.target.value)}
                      className="mt-2 w-full rounded-cloth border border-charcoal/15 bg-white px-3 py-2 font-body text-sm"
                    >
                      <option value="unspecified">Gender — unspecified</option>
                      <option value="girl">Girl</option>
                      <option value="boy">Boy</option>
                    </select>
                    <textarea
                      value={charAppearance}
                      onChange={(e) => setCharAppearance(e.target.value)}
                      placeholder="Appearance — e.g. round glasses, a gap-toothed smile, always wearing a red cap"
                      rows={2}
                      className="mt-2 w-full rounded-cloth border border-charcoal/15 bg-white px-3 py-2 font-body text-sm"
                    />
                    <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                      <input
                        value={charHair}
                        onChange={(e) => setCharHair(e.target.value)}
                        placeholder="Hair"
                        className="rounded-cloth border border-charcoal/15 bg-white px-3 py-2 font-body text-sm"
                      />
                      <input
                        value={charSkinTone}
                        onChange={(e) => setCharSkinTone(e.target.value)}
                        placeholder="Skin tone"
                        className="rounded-cloth border border-charcoal/15 bg-white px-3 py-2 font-body text-sm"
                      />
                      <input
                        value={charClothing}
                        onChange={(e) => setCharClothing(e.target.value)}
                        placeholder="Clothing"
                        className="rounded-cloth border border-charcoal/15 bg-white px-3 py-2 font-body text-sm"
                      />
                    </div>
                    <input
                      value={charPersonality}
                      onChange={(e) => setCharPersonality(e.target.value)}
                      placeholder="Personality (e.g. brave, curious, gentle)"
                      className="mt-2 w-full rounded-cloth border border-charcoal/15 bg-white px-3 py-2 font-body text-sm"
                    />
                    <p className="mt-2 font-body text-xs text-charcoal/50">
                      Saved to your family's character library — reusable in future stories too, for this or any child.
                    </p>
                  </div>
                )}
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

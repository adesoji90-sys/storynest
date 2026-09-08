import { useEffect, useMemo, useState } from "react";
import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { characters, getCharacterById } from "@/data/characters";
import { templates, getTemplateById } from "@/data/templates";
import { colorThemes, getThemeById } from "@/data/colorThemes";
import { PAGE_TIERS, getPrice } from "@/lib/pricing";
import GenerationProgressModal from "@/components/GenerationProgressModal";

// Split into two stages on purpose: writing the story (cheap, a Claude
// call) and illustrating it (real image-generation cost). Putting a real
// review-and-edit step between them means a parent can fix a typo or
// reword a paragraph without paying for illustrations twice — and gives
// them an actual editorial say in the book before it's locked into images.
const WRITE_STEPS = ["Writing your story"];
const ILLUSTRATE_STEPS = ["Setting up backgrounds", "Illustrating your pages"];

const MIN_WORDS = 50;

function wordCount(str) {
  return str.trim() ? str.trim().split(/\s+/).length : 0;
}

export default function StoryBuilder() {
  const router = useRouter();
  const [templateId, setTemplateId] = useState(1);
  const [characterId, setCharacterId] = useState("");
  const [themeId, setThemeId] = useState(colorThemes[3].id);
  const [pageTier, setPageTier] = useState("standard");
  const [title, setTitle] = useState("");
  const [values, setValues] = useState({});
  const [errors, setErrors] = useState({});
  const [libraryImages, setLibraryImages] = useState({});

  // Phase 1: writing the story text.
  const [writing, setWriting] = useState(false);
  const [writeError, setWriteError] = useState("");
  const [generatedStory, setGeneratedStory] = useState(null); // { title, locations, pages }

  // Phase 2: turning the (possibly edited) story into an illustrated book.
  const [illustrating, setIllustrating] = useState(false);
  const [illustrateStep, setIllustrateStep] = useState(0);
  const [illustrateError, setIllustrateError] = useState("");

  useEffect(() => {
    fetch("/api/library-characters")
      .then((r) => r.json())
      .then(setLibraryImages)
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (router.query.character) setCharacterId(String(router.query.character));
    if (router.query.template) setTemplateId(Number(router.query.template));
  }, [router.query.character, router.query.template]);

  useEffect(() => {
    if (!characterId || libraryImages[characterId]) return;
    fetch("/api/get-or-generate-character", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ characterId }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data?.imageUrl) setLibraryImages((m) => ({ ...m, [characterId]: data.imageUrl }));
      })
      .catch(() => {});
  }, [characterId, libraryImages]);

  const template = getTemplateById(templateId);
  const character = getCharacterById(characterId);
  const theme = getThemeById(themeId);

  const combinedFieldText = useMemo(() => Object.values(values).join(" "), [values]);

  function setField(key, val) {
    setValues((v) => ({ ...v, [key]: val }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  }

  function validate() {
    const nextErrors = {};
    if (!title.trim()) nextErrors.title = "Give the story a title.";
    if (!characterId) nextErrors.character = "Choose a character first.";
    template.fields.forEach((f) => {
      const val = values[f.key] || "";
      if (!val.trim()) nextErrors[f.key] = "This field is required.";
    });
    if (wordCount(combinedFieldText) < MIN_WORDS) {
      nextErrors._overall = `The story needs at least ${MIN_WORDS} words across the fields (currently ${wordCount(
        combinedFieldText
      )}).`;
    }
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  async function handleWriteStory() {
    setWriteError("");
    if (!validate()) return;
    setWriting(true);
    try {
      const storyRes = await fetch("/api/generate-story", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, character: character?.name, pageTier, ...values }),
      });
      if (!storyRes.ok) throw new Error("Story generation failed. Please try again.");
      const story = await storyRes.json();
      setGeneratedStory(story);
    } catch (err) {
      setWriteError(err.message || "Something went wrong generating your story.");
    } finally {
      setWriting(false);
    }
  }

  function updatePageText(index, newText) {
    setGeneratedStory((prev) => ({
      ...prev,
      pages: prev.pages.map((p, i) => (i === index ? { ...p, text: newText } : p)),
    }));
  }

  function updateStoryTitle(newTitle) {
    setGeneratedStory((prev) => ({ ...prev, title: newTitle }));
  }

  async function handleIllustrate() {
    setIllustrateError("");
    setIllustrating(true);
    try {
      const story = generatedStory;

      // A per-session id, purely to scope location-background caching to
      // THIS book — the same role customCharacterId plays for Premium
      // (see generate-location-background.js).
      const storySessionId = crypto.randomUUID();

      setIllustrateStep(0);
      const locationUrlById = {};
      await Promise.all(
        Object.entries(story.locations || {}).map(async ([locationId, description]) => {
          const r = await fetch("/api/generate-location-background", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ customCharacterId: storySessionId, locationId, description }),
          });
          const data = r.ok ? await r.json() : null;
          if (data?.imageUrl) locationUrlById[locationId] = data.imageUrl;
        })
      );

      // The character's pose is SELECTED from the cached library set, never
      // generated fresh. Note: editing a page's TEXT above does not change
      // its assigned pose/location/shot — those stay tied to Claude's
      // original scene understanding. Most edits (wording, a name, a
      // detail) don't invalidate that; a total rewrite of a page's action
      // could leave the illustration slightly mismatched to the new text.
      const uniquePoseIds = [...new Set([...story.pages.map((p) => p.pose), "neutral"])];
      const poseUrlEntries = await Promise.all(
        uniquePoseIds.map(async (poseId) => {
          const r = await fetch("/api/get-or-generate-character", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ characterId, poseId }),
          });
          const data = r.ok ? await r.json() : null;
          return [poseId, data?.imageUrl || null];
        })
      );
      const poseUrlByPoseId = Object.fromEntries(poseUrlEntries);

      setIllustrateStep(1);
      const scenes = story.pages.map((p) => {
        const settingUrl = locationUrlById[p.location_id];
        return {
          prompt: p.illustration_prompt,
          shot: p.shot,
          characters: [{ label: character.name, url: poseUrlByPoseId[p.pose] }],
          setting: settingUrl ? { label: `the setting (${p.location_id})`, url: settingUrl } : null,
        };
      });

      const illustrationRes = await fetch("/api/generate-illustrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: storySessionId, scenes }),
      });
      if (!illustrationRes.ok) throw new Error("Illustration generation failed. Please try again.");
      const { images, failedCount } = await illustrationRes.json();

      const draft = {
        tier: "basic",
        templateId,
        characterId,
        characterImageUrl: libraryImages[characterId] || poseUrlByPoseId.neutral || null,
        themeId,
        pageTier,
        title: story.title || title,
        pages: story.pages.map((p, i) => ({ text: p.text, image: images[i] || null })),
        illustrationFailedCount: failedCount,
        fields: values,
        createdAt: Date.now(),
      };
      sessionStorage.setItem("storynest_draft", JSON.stringify(draft));
      router.push("/preview");
    } catch (err) {
      setIllustrateError(err.message || "Something went wrong illustrating your book.");
    } finally {
      setIllustrating(false);
    }
  }

  return (
    <>
      <Head>
        <title>Build your story — StoryNest</title>
      </Head>
      <GenerationProgressModal open={writing} steps={WRITE_STEPS} currentStepIndex={0} />
      <GenerationProgressModal open={illustrating} steps={ILLUSTRATE_STEPS} currentStepIndex={illustrateStep} />
      <main className="min-h-screen bg-ivory_cloth text-charcoal">
        <header className="mx-auto flex max-w-5xl items-center justify-between px-6 py-6">
          <Link href="/" className="font-display text-xl">StoryNest</Link>
          <Link href="/characters" className="font-body text-sm text-charcoal/60">← Choose a different character</Link>
        </header>

        {!generatedStory ? (
          <div className="mx-auto grid max-w-5xl gap-10 px-6 pb-24 md:grid-cols-2">
            {/* FORM */}
            <div>
              <h1 className="font-display text-3xl">Tell us the story</h1>

              <label className="mt-6 block font-body font-semibold">Template</label>
              <select
                value={templateId}
                onChange={(e) => setTemplateId(Number(e.target.value))}
                className="mt-1 w-full rounded-cloth border border-charcoal/15 bg-white px-4 py-2 font-body"
              >
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>{t.title}</option>
                ))}
              </select>
              <p className="mt-1 font-body text-xs text-charcoal/50">{template.theme}</p>

              <label className="mt-5 block font-body font-semibold">Main character</label>
              <select
                value={characterId}
                onChange={(e) => setCharacterId(e.target.value)}
                className="mt-1 w-full rounded-cloth border border-charcoal/15 bg-white px-4 py-2 font-body"
              >
                <option value="">Select a character…</option>
                {characters.map((c) => (
                  <option key={c.id} value={c.id}>{c.name} — {c.ethnicity}, age {c.age}</option>
                ))}
              </select>
              {errors.character && <p className="mt-1 font-body text-sm text-coral_ember">{errors.character}</p>}

              <label className="mt-5 block font-body font-semibold">Story title</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Adaeze and the Magic Calabash"
                className="mt-1 w-full rounded-cloth border border-charcoal/15 bg-white px-4 py-2 font-body"
              />
              {errors.title && <p className="mt-1 font-body text-sm text-coral_ember">{errors.title}</p>}

              {template.fields.map((f) => (
                <div key={f.key} className="mt-5">
                  <label className="block font-body font-semibold">{f.label}</label>
                  {f.type === "select" ? (
                    <select
                      value={values[f.key] || ""}
                      onChange={(e) => setField(f.key, e.target.value)}
                      className="mt-1 w-full rounded-cloth border border-charcoal/15 bg-white px-4 py-2 font-body"
                    >
                      <option value="">Choose one…</option>
                      {f.options.map((o) => <option key={o}>{o}</option>)}
                    </select>
                  ) : f.type === "textarea" ? (
                    <textarea
                      value={values[f.key] || ""}
                      onChange={(e) => setField(f.key, e.target.value)}
                      placeholder={f.placeholder}
                      rows={3}
                      className="mt-1 w-full rounded-cloth border border-charcoal/15 bg-white px-4 py-2 font-body"
                    />
                  ) : (
                    <input
                      value={values[f.key] || ""}
                      onChange={(e) => setField(f.key, e.target.value)}
                      placeholder={f.placeholder}
                      className="mt-1 w-full rounded-cloth border border-charcoal/15 bg-white px-4 py-2 font-body"
                    />
                  )}
                  {errors[f.key] && <p className="mt-1 font-body text-sm text-coral_ember">{errors[f.key]}</p>}
                </div>
              ))}

              <label className="mt-6 block font-body font-semibold">Book length</label>
              <div className="mt-2 grid grid-cols-3 gap-2">
                {PAGE_TIERS.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setPageTier(t.id)}
                    className={`rounded-cloth border-2 p-3 text-center font-body ${
                      pageTier === t.id ? "border-coral_ember bg-coral_ember/5" : "border-charcoal/15"
                    }`}
                  >
                    <p className="font-bold">{t.label}</p>
                    <p className="text-sm text-charcoal/60">₦{getPrice("basic", t.id).toLocaleString("en-NG")}</p>
                  </button>
                ))}
              </div>

              <label className="mt-6 block font-body font-semibold">Color theme</label>
              <div className="mt-2 grid grid-cols-4 gap-2">
                {colorThemes.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setThemeId(t.id)}
                    className={`rounded-cloth border-2 p-2 text-left ${themeId === t.id ? "border-coral_ember" : "border-transparent"}`}
                    style={{ background: t.bg }}
                    title={t.name}
                  >
                    <span className="block h-4 w-4 rounded-full" style={{ background: t.accent }} />
                    <span className="mt-1 block truncate font-body text-[10px]" style={{ color: t.text }}>{t.name}</span>
                  </button>
                ))}
              </div>

              {errors._overall && <p className="mt-4 font-body text-sm text-coral_ember">{errors._overall}</p>}
              {writeError && <p className="mt-4 font-body text-sm text-coral_ember">{writeError}</p>}

              <button
                onClick={handleWriteStory}
                disabled={writing}
                className="mt-8 w-full rounded-cloth bg-coral_ember px-6 py-3 font-body font-bold text-white disabled:opacity-50"
              >
                {writing ? "Writing…" : "Write my story"}
              </button>
              <p className="mt-2 text-center font-body text-xs text-charcoal/50">
                You'll get a chance to read and edit the story before it's illustrated.
              </p>
            </div>

            {/* LIVE PREVIEW */}
            <div className="rounded-cloth p-6" style={{ background: theme.bg, color: theme.text }}>
              <p className="font-body text-xs uppercase tracking-wide opacity-60">Live preview</p>
              <h2 className="mt-2 font-display text-2xl">{title || "Your story title"}</h2>
              {character && libraryImages[character.id] && (
                <img
                  src={libraryImages[character.id]}
                  alt={character.name}
                  className="mt-3 h-16 w-16 rounded-full object-cover"
                />
              )}
              <p className="mt-1 font-body text-sm opacity-70">
                Starring {character ? character.name : "your chosen character"}
              </p>
              <div className="mt-4 h-2 w-16 rounded-full" style={{ background: theme.accent }} />
              <div className="mt-6 space-y-3 font-body text-sm">
                {template.fields.map((f) => (
                  <p key={f.key}>
                    <span className="font-semibold">{f.label}:</span>{" "}
                    {values[f.key] || <span className="opacity-40">not filled in yet</span>}
                  </p>
                ))}
              </div>
            </div>
          </div>
        ) : (
          /* STORY REVIEW — read and edit before illustrating */
          <div className="mx-auto max-w-2xl px-6 pb-24">
            <h1 className="font-display text-3xl">Read your story</h1>
            <p className="mt-1 font-body text-sm text-charcoal/60">
              Edit anything below before it's turned into an illustrated book. Illustrations are matched to each
              page's original scene, so a full rewrite of a page's action may not perfectly match its picture.
            </p>

            <label className="mt-6 block font-body font-semibold">Title</label>
            <input
              value={generatedStory.title}
              onChange={(e) => updateStoryTitle(e.target.value)}
              className="mt-1 w-full rounded-cloth border border-charcoal/15 bg-white px-4 py-2 font-display text-lg"
            />

            <div className="mt-6 space-y-5">
              {generatedStory.pages.map((page, i) => (
                <div key={i} className="rounded-cloth bg-white p-4 shadow-sm">
                  <p className="font-body text-xs font-bold uppercase tracking-wide text-charcoal/40">
                    Page {i + 1} of {generatedStory.pages.length}
                  </p>
                  <textarea
                    value={page.text}
                    onChange={(e) => updatePageText(i, e.target.value)}
                    rows={3}
                    className="mt-2 w-full rounded-cloth border border-charcoal/15 bg-ivory_cloth px-3 py-2 font-body"
                  />
                </div>
              ))}
            </div>

            {illustrateError && <p className="mt-4 font-body text-sm text-coral_ember">{illustrateError}</p>}

            <div className="mt-8 flex flex-wrap gap-3">
              <button
                onClick={() => setGeneratedStory(null)}
                disabled={illustrating}
                className="rounded-cloth border border-charcoal/20 px-5 py-3 font-body font-semibold disabled:opacity-50"
              >
                ← Edit details
              </button>
              <button
                onClick={handleWriteStory}
                disabled={writing || illustrating}
                className="rounded-cloth border border-charcoal/20 px-5 py-3 font-body font-semibold disabled:opacity-50"
              >
                {writing ? "Rewriting…" : "🔄 Rewrite story"}
              </button>
              <button
                onClick={handleIllustrate}
                disabled={illustrating}
                className="ml-auto rounded-cloth bg-coral_ember px-6 py-3 font-body font-bold text-white disabled:opacity-50"
              >
                {illustrating ? "Illustrating…" : "Illustrate my book →"}
              </button>
            </div>
          </div>
        )}
      </main>
    </>
  );
}

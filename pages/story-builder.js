import { useEffect, useMemo, useState } from "react";
import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { characters, getCharacterById } from "@/data/characters";
import { templates, getTemplateById } from "@/data/templates";
import { colorThemes, getThemeById } from "@/data/colorThemes";
import { PAGE_TIERS, getPrice } from "@/lib/pricing";

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
  const [generating, setGenerating] = useState(false);
  const [apiError, setApiError] = useState("");
  const [libraryImages, setLibraryImages] = useState({});

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

  const combinedFieldText = useMemo(
    () => Object.values(values).join(" "),
    [values]
  );

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
      if (!val.trim()) {
        nextErrors[f.key] = "This field is required.";
      } else if (f.type === "textarea" && wordCount(val) < 12) {
        // Individual long-form fields don't need to hit 50 words each —
        // the 50-word minimum applies to the story as a whole, checked below.
      }
    });
    if (wordCount(combinedFieldText) < MIN_WORDS) {
      nextErrors._overall = `The story needs at least ${MIN_WORDS} words across the fields (currently ${wordCount(
        combinedFieldText
      )}).`;
    }
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  async function handlePreview() {
    setApiError("");
    if (!validate()) return;
    setGenerating(true);
    try {
      const res = await fetch("/api/generate-story", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          template_id: templateId,
          title,
          character: character?.name,
          pageTier,
          ...values,
        }),
      });
      if (!res.ok) throw new Error("Story generation failed. Please try again.");
      const data = await res.json();

      const draft = {
        templateId,
        characterId,
        characterImageUrl: libraryImages[characterId] || null,
        themeId,
        pageTier,
        title: data.title || title,
        story: data.story,
        pages: data.pages,
        fields: values,
        createdAt: Date.now(),
      };
      sessionStorage.setItem("storynest_draft", JSON.stringify(draft));
      router.push("/preview");
    } catch (err) {
      setApiError(err.message || "Something went wrong generating your story.");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <>
      <Head>
        <title>Build your story — StoryNest</title>
      </Head>
      <main className="min-h-screen bg-ivory_cloth text-charcoal">
        <header className="mx-auto flex max-w-5xl items-center justify-between px-6 py-6">
          <Link href="/" className="font-display text-xl">StoryNest</Link>
          <Link href="/characters" className="font-body text-sm text-charcoal/60">← Choose a different character</Link>
        </header>

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
            {apiError && <p className="mt-4 font-body text-sm text-coral_ember">{apiError}</p>}

            <button
              onClick={handlePreview}
              disabled={generating}
              className="mt-8 w-full rounded-cloth bg-coral_ember px-6 py-3 font-body font-bold text-white disabled:opacity-50"
            >
              {generating ? "Writing your story…" : "Preview story"}
            </button>
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
      </main>
    </>
  );
}

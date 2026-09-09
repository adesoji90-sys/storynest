import { useMemo, useState } from "react";
import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { characters } from "@/data/characters";
import { templates, getTemplateById } from "@/data/templates";
import { colorThemes, getThemeById } from "@/data/colorThemes";
import { POSES } from "@/lib/characterPoses";
import { PAGE_TIERS, getPrice } from "@/lib/pricing";
import { STYLES } from "@/lib/imageStyle";
import GenerationProgressModal from "@/components/GenerationProgressModal";

const WRITE_STEPS = ["Writing your story"];
const ILLUSTRATE_STEPS = ["Setting up backgrounds", "Illustrating your pages"];
const CHARACTER_STEPS = ["Creating every pose"];

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function PremiumBuilder() {
  const router = useRouter();
  const [step, setStep] = useState(1);

  // Step 1 — photo + child details
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [childName, setChildName] = useState("");
  const [childAge, setChildAge] = useState("");
  const [childGender, setChildGender] = useState("female");
  const [generatingCharacter, setGeneratingCharacter] = useState(false);
  const [characterPoses, setCharacterPoses] = useState(null); // { neutral: {base64,url}, happy: {...}, ... }
  const [customCharacterId, setCustomCharacterId] = useState(null);
  const [failedCustomPoses, setFailedCustomPoses] = useState([]);
  const [characterError, setCharacterError] = useState("");

  // Step 2 — story fields
  const [templateId, setTemplateId] = useState(1);
  const [themeId, setThemeId] = useState(colorThemes[3].id);
  const [title, setTitle] = useState("");
  const [authorName, setAuthorName] = useState("");
  const [orientation, setOrientation] = useState("portrait");
  const [styleId, setStyleId] = useState("painterly");
  const [supportingCharacterId, setSupportingCharacterId] = useState("");
  const [supportingCharacterUrl, setSupportingCharacterUrl] = useState(null);
  const [resolvingSupporting, setResolvingSupporting] = useState(false);
  const [values, setValues] = useState({});
  const [pageTier, setPageTier] = useState("standard");
  const [errors, setErrors] = useState({});

  // Step 3 — write story, review/edit it, then illustrate
  const [writingStory, setWritingStory] = useState(false);
  const [writeError, setWriteError] = useState("");
  const [generatedStory, setGeneratedStory] = useState(null); // { title, locations, pages }
  const [illustrating, setIllustrating] = useState(false);
  const [illustrateStep, setIllustrateStep] = useState(0);
  const [illustrateError, setIllustrateError] = useState("");

  const template = getTemplateById(templateId);
  const theme = getThemeById(themeId);
  const supportingCharacter = useMemo(
    () => characters.find((c) => c.id === supportingCharacterId) || null,
    [supportingCharacterId]
  );

  async function handlePhotoChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
    setCharacterPoses(null);
    setFailedCustomPoses([]);
    setCharacterError("");
  }

  async function handleGenerateCharacter() {
    if (!photoFile) {
      setCharacterError("Upload a photo first.");
      return;
    }
    setGeneratingCharacter(true);
    setCharacterError("");
    try {
      const base64 = await fileToBase64(photoFile);
      const res = await fetch("/api/generate-character-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          photoBase64: base64,
          mimeType: photoFile.type || "image/png",
          childName,
          styleId,
        }),
      });
      if (!res.ok) throw new Error("Couldn't generate a character from that photo. Try a clear, front-facing photo.");
      const data = await res.json();
      setCharacterPoses(data.poses);
      setCustomCharacterId(data.customCharacterId);
      setFailedCustomPoses(data.failedPoses || []);
    } catch (err) {
      setCharacterError(err.message || "Something went wrong.");
    } finally {
      setGeneratingCharacter(false);
    }
  }

  async function handleSupportingCharacterChange(id) {
    setSupportingCharacterId(id);
    setSupportingCharacterUrl(null);
    if (!id) return;
    setResolvingSupporting(true);
    try {
      const res = await fetch("/api/get-or-generate-character", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ characterId: id, poseId: "neutral" }),
      });
      if (res.ok) {
        const data = await res.json();
        setSupportingCharacterUrl(data.imageUrl);
      }
    } finally {
      setResolvingSupporting(false);
    }
  }

  function setField(key, val) {
    setValues((v) => ({ ...v, [key]: val }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  }

  function validateStoryFields() {
    const nextErrors = {};
    if (!title.trim()) nextErrors.title = "Give the story a title.";
    template.fields.forEach((f) => {
      if (!(values[f.key] || "").trim()) nextErrors[f.key] = "This field is required.";
    });
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  async function handleWriteStory() {
    setWriteError("");
    try {
      if (!characterPoses) {
        setWriteError("Generate a character first.");
        setStep(1);
        return;
      }
      if (!validateStoryFields()) return;
      setWritingStory(true);
      const storyRes = await fetch("/api/generate-story-premium", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          mainCharacterName: childName,
          supportingCharacterName: supportingCharacter?.name,
          pageCount: PAGE_TIERS.find((t) => t.id === pageTier)?.pages || 10,
          ...values,
        }),
      });
      if (!storyRes.ok) throw new Error("Story generation failed. Please try again.");
      const story = await storyRes.json();
      setGeneratedStory(story);
      setStep(3);
    } catch (err) {
      setWriteError(err.message || "Something went wrong generating your story.");
    } finally {
      setWritingStory(false);
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

      setIllustrateStep(0);

      // Resolve ONE background per distinct location the story visits —
      // never per page. Every page sharing a location_id reuses the exact
      // same reference, which is what keeps "the market" recognizable from
      // page 3 to page 9.
      const locationEntries = Object.entries(story.locations || {});
      const locationUrlById = {};
      await Promise.all(
        locationEntries.map(async ([locationId, description]) => {
          const r = await fetch("/api/generate-location-background", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ customCharacterId, locationId, description, styleId }),
          });
          const data = r.ok ? await r.json() : null;
          if (data?.imageUrl) locationUrlById[locationId] = data.imageUrl;
        })
      );

      // Resolve the supporting character's pose set (if any) — same
      // selection-only principle as the custom character: never generate a
      // new pose here, only look up what's cached. Note: editing a page's
      // TEXT in the review step does not change its assigned pose/location/
      // shot — those stay tied to Claude's original scene understanding.
      let supportingPoseUrlByPoseId = {};
      if (supportingCharacterId) {
        const uniquePoseIds = [...new Set(story.pages.map((p) => p.pose))];
        const entries = await Promise.all(
          uniquePoseIds.map(async (poseId) => {
            const r = await fetch("/api/get-or-generate-character", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ characterId: supportingCharacterId, poseId, styleId }),
            });
            const data = r.ok ? await r.json() : null;
            return [poseId, data?.imageUrl || null];
          })
        );
        supportingPoseUrlByPoseId = Object.fromEntries(entries);
      }

      setIllustrateStep(1);

      // Characters AND the setting are all selected — never generated —
      // using the ids Claude assigned to that page. Both characters share
      // the same pose id (emotionally in sync), and every page at the same
      // location_id shares the same background reference.
      const scenes = story.pages.map((p) => {
        const poseId = characterPoses[p.pose] ? p.pose : "neutral"; // fall back if that pose failed to generate
        const sceneCharacters = [
          { label: childName || "main character", base64: characterPoses[poseId].base64 },
        ];
        const supportingUrl = supportingPoseUrlByPoseId[p.pose] || supportingPoseUrlByPoseId.neutral;
        if (supportingUrl) {
          sceneCharacters.push({ label: supportingCharacter?.name || "supporting character", url: supportingUrl });
        }
        const settingUrl = locationUrlById[p.location_id];
        return {
          prompt: p.illustration_prompt,
          shot: p.shot,
          characters: sceneCharacters,
          setting: settingUrl ? { label: `the setting (${p.location_id})`, url: settingUrl } : null,
        };
      });

      const illustrationRes = await fetch("/api/generate-illustrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: customCharacterId, scenes, styleId }),
      });
      if (!illustrationRes.ok) throw new Error("Illustration generation failed. Please try again.");
      const { images, failedCount } = await illustrationRes.json();

      const draft = {
        tier: "premium",
        templateId,
        themeId,
        pageTier,
        orientation,
        styleId,
        authorName: authorName.trim() || null,
        title: story.title || title,
        pages: story.pages.map((p, i) => ({ text: p.text, image: images[i] || null })),
        childName,
        customCharacterId,
        // A URL, not embedded base64 — matches Basic tier's
        // characterImageUrl field, and keeps the draft small enough for
        // sessionStorage (a real, previously-hit quota bug — see
        // generate-illustrations.js).
        characterImageUrl: characterPoses.neutral.url,
        // Premium already generates every pose at upload — "happy" is
        // already in hand, no extra resolution step needed the way Basic
        // tier needs one (see story-builder.js).
        backCoverImageUrl: characterPoses.happy?.url || characterPoses.neutral.url,
        supportingCharacterId,
        supportingCharacterUrl: supportingCharacterUrl || null,
        illustrationFailedCount: failedCount,
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
        <title>Premium story builder — StoryNest</title>
      </Head>
      <GenerationProgressModal open={generatingCharacter} steps={CHARACTER_STEPS} currentStepIndex={0} />
      <GenerationProgressModal open={writingStory} steps={WRITE_STEPS} currentStepIndex={0} />
      <GenerationProgressModal open={illustrating} steps={ILLUSTRATE_STEPS} currentStepIndex={illustrateStep} />
      <main className="min-h-screen bg-ivory_cloth text-charcoal">
        <header className="mx-auto flex max-w-3xl items-center justify-between px-6 py-6">
          <Link href="/" className="font-display text-xl">StoryNest</Link>
          <span className="rounded-full bg-marigold/30 px-3 py-1 font-body text-xs font-bold uppercase tracking-wide text-indigo_night">
            Premium
          </span>
        </header>

        <div className="mx-auto max-w-3xl px-6 pb-24">
          {/* STEP 1: PHOTO + CHARACTER */}
          {step === 1 && (
            <div>
              <h1 className="font-display text-3xl">Turn your child into the hero</h1>
              <p className="mt-2 font-body text-charcoal/70">
                Upload a clear, front-facing photo. We'll turn it into a semi-realistic illustrated character in
                our storybook style — the original photo isn't kept once the character is generated.
              </p>

              <div className="mt-6 grid gap-6 sm:grid-cols-2">
                <div>
                  <label className="block font-body font-semibold">Child's photo</label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handlePhotoChange}
                    className="mt-2 block w-full font-body text-sm"
                  />
                  {photoPreview && (
                    <img src={photoPreview} alt="Uploaded preview" className="mt-4 h-40 w-40 rounded-cloth object-cover" />
                  )}
                </div>
                <div>
                  <label className="block font-body font-semibold">Child's first name</label>
                  <input
                    value={childName}
                    onChange={(e) => setChildName(e.target.value)}
                    placeholder="e.g. Amaka"
                    className="mt-1 w-full rounded-cloth border border-charcoal/15 bg-white px-4 py-2 font-body"
                  />
                  <label className="mt-4 block font-body font-semibold">Age</label>
                  <input
                    type="number"
                    min="1"
                    max="14"
                    value={childAge}
                    onChange={(e) => setChildAge(e.target.value)}
                    className="mt-1 w-full rounded-cloth border border-charcoal/15 bg-white px-4 py-2 font-body"
                  />
                  <label className="mt-4 block font-body font-semibold">Gender</label>
                  <select
                    value={childGender}
                    onChange={(e) => setChildGender(e.target.value)}
                    className="mt-1 w-full rounded-cloth border border-charcoal/15 bg-white px-4 py-2 font-body"
                  >
                    <option value="female">Girl</option>
                    <option value="male">Boy</option>
                  </select>
                </div>
              </div>

              <label className="mt-6 block font-body font-semibold">Illustration style</label>
              <p className="mt-1 font-body text-xs text-charcoal/50">
                Choose before generating — the character's style is locked in across all 6 poses once created,
                the same way their face and outfit are.
              </p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {Object.values(STYLES).map((s) => (
                  <button
                    key={s.id}
                    onClick={() => setStyleId(s.id)}
                    className={`rounded-cloth border-2 p-3 text-left font-body ${
                      styleId === s.id ? "border-coral_ember bg-coral_ember/5" : "border-charcoal/15"
                    }`}
                  >
                    <p className="font-bold">{s.label}</p>
                    <p className="text-xs text-charcoal/50">{s.description}</p>
                  </button>
                ))}
              </div>

              <button
                onClick={handleGenerateCharacter}
                disabled={generatingCharacter || !photoFile}
                className="mt-6 rounded-cloth bg-coral_ember px-6 py-3 font-body font-bold text-white disabled:opacity-50"
              >
                {generatingCharacter ? "Creating character in every pose…" : "Generate character"}
              </button>
              {generatingCharacter && (
                <p className="mt-2 font-body text-xs text-charcoal/50">
                  Generating {childName || "your child"} in all 6 story poses at once — this takes a bit longer than
                  one image, but means every page of the book uses the exact same art, never a fresh redraw.
                </p>
              )}
              {characterError && <p className="mt-2 font-body text-sm text-coral_ember">{characterError}</p>}

              {characterPoses && (
                <div className="mt-6 rounded-cloth bg-white p-6 text-center shadow-sm">
                  <img
                    src={`data:image/png;base64,${characterPoses.neutral.base64}`}
                    alt={`${childName}'s illustrated character`}
                    className="mx-auto h-48 w-48 rounded-cloth object-contain"
                  />
                  <div className="mt-4 flex justify-center gap-2">
                    {POSES.filter((p) => p.id !== "neutral").map((p) =>
                      characterPoses[p.id] ? (
                        <img
                          key={p.id}
                          src={`data:image/png;base64,${characterPoses[p.id].base64}`}
                          alt={p.label}
                          title={p.label}
                          className="h-12 w-12 rounded-cloth object-contain"
                        />
                      ) : (
                        <div
                          key={p.id}
                          title={`${p.label} — didn't generate cleanly`}
                          className="flex h-12 w-12 items-center justify-center rounded-cloth bg-charcoal/10 text-xs text-charcoal/40"
                        >
                          ✕
                        </div>
                      )
                    )}
                  </div>
                  {failedCustomPoses.length > 0 && (
                    <p className="mt-2 font-body text-xs text-coral_ember">
                      {failedCustomPoses.length} pose(s) didn't generate cleanly — those scenes will fall back to the
                      standing pose instead.
                    </p>
                  )}
                  <div className="mt-4 flex justify-center gap-3">
                    <button
                      onClick={handleGenerateCharacter}
                      className="rounded-cloth border border-charcoal/20 px-4 py-2 font-body text-sm"
                    >
                      Regenerate
                    </button>
                    <button
                      onClick={() => setStep(2)}
                      className="rounded-cloth bg-coral_ember px-6 py-2 font-body font-bold text-white"
                    >
                      Use this character
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* STEP 2: STORY FIELDS */}
          {step === 2 && (
            <div>
              <button onClick={() => setStep(1)} className="font-body text-sm text-charcoal/60">← Back to character</button>
              <h1 className="mt-2 font-display text-3xl">Tell the story</h1>

              <label className="mt-6 block font-body font-semibold">Template</label>
              <select
                value={templateId}
                onChange={(e) => setTemplateId(Number(e.target.value))}
                className="mt-1 w-full rounded-cloth border border-charcoal/15 bg-white px-4 py-2 font-body"
              >
                {templates.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
              </select>

              <label className="mt-5 block font-body font-semibold">
                Supporting character <span className="font-normal text-charcoal/50">(optional — pick from our library)</span>
              </label>
              <select
                value={supportingCharacterId}
                onChange={(e) => handleSupportingCharacterChange(e.target.value)}
                className="mt-1 w-full rounded-cloth border border-charcoal/15 bg-white px-4 py-2 font-body"
              >
                <option value="">None — Claude will invent a friend, family member, or animal companion</option>
                {characters.map((c) => (
                  <option key={c.id} value={c.id}>{c.name} — {c.ethnicity}, age {c.age}</option>
                ))}
              </select>
              {resolvingSupporting && (
                <p className="mt-2 font-body text-sm text-charcoal/50">
                  Preparing {supportingCharacter?.name}'s reference art — first time takes a moment, then it's cached for every future story.
                </p>
              )}
              {supportingCharacterUrl && (
                <div className="mt-3 flex items-center gap-3">
                  <img src={supportingCharacterUrl} alt={supportingCharacter?.name} className="h-16 w-16 rounded-cloth object-contain" />
                  <p className="font-body text-sm text-charcoal/70">
                    {supportingCharacter?.name} will join {childName || "your child"} — we'll automatically pick a
                    matching pose (happy, worried, exploring, etc.) for each page from their cached art.
                  </p>
                </div>
              )}

              <label className="mt-5 block font-body font-semibold">Story title</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={`e.g. ${childName || "Amaka"} and the Magic Calabash`}
                className="mt-1 w-full rounded-cloth border border-charcoal/15 bg-white px-4 py-2 font-body"
              />
              {errors.title && <p className="mt-1 font-body text-sm text-coral_ember">{errors.title}</p>}

              <label className="mt-5 block font-body font-semibold">
                Author line <span className="font-normal text-charcoal/50">(shown exactly as typed on the cover — optional)</span>
              </label>
              <input
                value={authorName}
                onChange={(e) => setAuthorName(e.target.value)}
                placeholder="e.g. Written by Mummy, or By the Adeniji Family"
                className="mt-1 w-full rounded-cloth border border-charcoal/15 bg-white px-4 py-2 font-body"
              />
              <p className="mt-1 font-body text-xs text-charcoal/50">
                {authorName.trim()
                  ? `Cover will show: "${authorName.trim()}"`
                  : "Leave blank to skip the author line entirely."}
              </p>

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
                    <p className="text-sm text-charcoal/60">₦{getPrice("premium", t.id).toLocaleString("en-NG")}</p>
                  </button>
                ))}
              </div>

              <label className="mt-6 block font-body font-semibold">Page orientation</label>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {[
                  { id: "portrait", label: "Portrait", hint: "Tall — classic book shape" },
                  { id: "landscape", label: "Landscape", hint: "Wide — great for screens" },
                ].map((o) => (
                  <button
                    key={o.id}
                    onClick={() => setOrientation(o.id)}
                    className={`rounded-cloth border-2 p-3 text-center font-body ${
                      orientation === o.id ? "border-coral_ember bg-coral_ember/5" : "border-charcoal/15"
                    }`}
                  >
                    <p className="font-bold">{o.label}</p>
                    <p className="text-xs text-charcoal/50">{o.hint}</p>
                  </button>
                ))}
              </div>

              {writeError && <p className="mt-4 font-body text-sm text-coral_ember">{writeError}</p>}

              <button
                onClick={handleWriteStory}
                disabled={writingStory || resolvingSupporting}
                className="mt-8 w-full rounded-cloth bg-coral_ember px-6 py-3 font-body font-bold text-white disabled:opacity-50"
              >
                {writingStory ? "Writing…" : "Write my story"}
              </button>
              <p className="mt-2 text-center font-body text-xs text-charcoal/50">
                You'll get a chance to read and edit the story before it's illustrated.
              </p>
            </div>
          )}

          {/* STEP 3: STORY REVIEW — read and edit before illustrating */}
          {step === 3 && generatedStory && (
            <div>
              <button onClick={() => setStep(2)} className="font-body text-sm text-charcoal/60">← Back to details</button>
              <h1 className="mt-2 font-display text-3xl">Read your story</h1>
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
                  onClick={() => setStep(2)}
                  disabled={illustrating}
                  className="rounded-cloth border border-charcoal/20 px-5 py-3 font-body font-semibold disabled:opacity-50"
                >
                  ← Edit details
                </button>
                <button
                  onClick={handleWriteStory}
                  disabled={writingStory || illustrating}
                  className="rounded-cloth border border-charcoal/20 px-5 py-3 font-body font-semibold disabled:opacity-50"
                >
                  {writingStory ? "Rewriting…" : "🔄 Rewrite story"}
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
        </div>
      </main>
    </>
  );
}

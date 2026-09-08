import { useEffect, useState } from "react";
import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { getCharacterById } from "@/data/characters";
import { getThemeById } from "@/data/colorThemes";

export default function Preview() {
  const router = useRouter();
  const [draft, setDraft] = useState(null);

  useEffect(() => {
    const raw = sessionStorage.getItem("storynest_draft");
    if (!raw) {
      router.replace("/characters");
      return;
    }
    setDraft(JSON.parse(raw));
  }, [router]);

  if (!draft) return null;

  const theme = getThemeById(draft.themeId);
  const isPremium = draft.tier === "premium";
  // Both tiers now produce a fully illustrated book (see README "Basic
  // tier is now illustrated too") — Premium's only remaining difference
  // is a custom photo character instead of one from the library, which is
  // why the portrait branch below still differs but the page-content
  // rendering no longer does.
  const displayName = isPremium ? draft.childName : getCharacterById(draft.characterId)?.name;

  return (
    <>
      <Head>
        <title>{draft.title} — Preview — StoryNest</title>
      </Head>
      <main className="min-h-screen bg-ivory_cloth text-charcoal">
        <header className="mx-auto flex max-w-3xl items-center justify-between px-6 py-6">
          <Link href="/" className="font-display text-xl">StoryNest</Link>
          <Link href={isPremium ? "/premium-builder" : "/story-builder"} className="font-body text-sm text-charcoal/60">
            ← Edit story
          </Link>
        </header>

        <div className="mx-auto max-w-3xl px-6 pb-24">
          <div
            className="relative overflow-hidden rounded-cloth p-8 shadow-lg"
            style={{ background: theme.bg, color: theme.text }}
          >
            <div
              className="pointer-events-none absolute inset-0 flex items-center justify-center font-display text-6xl opacity-10"
              style={{ transform: "rotate(-20deg)" }}
            >
              PREVIEW
            </div>

            <div className="relative">
              {isPremium ? (
                <img
                  src={`data:image/png;base64,${draft.characterImageBase64}`}
                  alt={displayName}
                  className="mx-auto h-24 w-24 rounded-full object-cover"
                  style={{ border: `3px solid ${theme.accent}` }}
                />
              ) : draft.characterImageUrl ? (
                <img
                  src={draft.characterImageUrl}
                  alt={displayName}
                  className="mx-auto h-24 w-24 rounded-full object-cover"
                  style={{ border: `3px solid ${theme.accent}` }}
                />
              ) : (
                <div
                  className="mx-auto flex h-24 w-24 items-center justify-center rounded-full font-display text-2xl"
                  style={{ background: theme.accent, color: theme.bg }}
                >
                  {displayName?.[0]}
                </div>
              )}

              <h1 className="mt-4 text-center font-display text-3xl">{draft.title}</h1>
              <p className="mt-1 text-center font-body text-sm opacity-70">
                Starring {displayName} · {draft.pages.length} illustrated pages
              </p>

              <div className="mt-8">
                {draft.pages[0]?.image && (
                  <img
                    src={`data:image/png;base64,${draft.pages[0].image}`}
                    alt="Page 1 illustration"
                    className="mx-auto mb-4 w-full max-w-sm rounded-cloth object-cover"
                  />
                )}
                <p className="font-body leading-relaxed">{draft.pages[0]?.text}</p>
                <p className="mt-6 text-center font-body text-sm italic opacity-60">
                  — {draft.pages.length - 1} more illustrated pages unlock after purchase —
                </p>
              </div>
            </div>
          </div>

          <div className="mt-8 flex flex-wrap justify-center gap-4">
            <Link
              href={isPremium ? "/premium-builder" : "/story-builder"}
              className="rounded-cloth border border-charcoal/20 px-6 py-3 font-body font-semibold"
            >
              Make changes
            </Link>
            <Link
              href="/checkout"
              className="rounded-cloth bg-coral_ember px-8 py-3 font-body font-bold text-white"
            >
              Buy this story
            </Link>
          </div>
        </div>
      </main>
    </>
  );
}

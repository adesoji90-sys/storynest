import { useEffect, useState } from "react";
import Head from "next/head";
import Link from "next/link";
import { characters } from "@/data/characters";

const HERO_SLOT_COUNT = 2;
const HERO_ROTATE_MS = 7000;

// Cycles through the character list two at a time, on a timer — replaces
// an earlier version that continuously slid 3 characters across the
// screen, which read as a UI ticker rather than calm background art. A
// slow crossfade of 2 reads much more like ambient texture.
function useRotatingCharacters(list, count, intervalMs) {
  const [startIndex, setStartIndex] = useState(0);
  useEffect(() => {
    const id = setInterval(() => {
      setStartIndex((i) => (i + count) % list.length);
    }, intervalMs);
    return () => clearInterval(id);
  }, [list.length, count, intervalMs]);
  const visible = [];
  for (let i = 0; i < count; i++) {
    visible.push(list[(startIndex + i) % list.length]);
  }
  return visible;
}

const steps = [
  { n: 1, title: "Choose a character", body: "Pick from 30 Nigerian and diaspora characters your child will recognize themselves in." },
  { n: 2, title: "Fill in the story", body: "Answer a few guided prompts — the setting, the problem, the lesson. You write it, we format it." },
  { n: 3, title: "Download the book", body: "Get a finished, illustrated PDF in minutes. Print it or read it straight from your phone." },
];

const pricing = [
  { name: "Basic", price: "₦3,000 – ₦7,000", unit: "by book length (5/10/15 pages)", features: ["Choose from 30 characters", "Fully illustrated storybook", "8 color themes", "Instant PDF download"] },
  { name: "Premium", price: "₦12,000 – ₦25,000", unit: "by book length (5/10/15 pages)", features: ["Upload your child's photo", "Semi-realistic illustrated character", "5–15 illustrated pages", "Optional printed copy"], featured: true },
  { name: "Subscription", price: "₦8,000", unit: "per month", features: ["Unlimited Basic-tier stories", "Story library that saves", "All templates unlocked", "Priority support"] },
];

const sampleCharacters = characters.filter((c) =>
  ["adaeze", "tunde", "zainab", "hauwa", "sarah", "ibrahim", "kemi", "emma"].includes(c.id)
);

export default function Home() {
  const [libraryImages, setLibraryImages] = useState({});
  const heroCharacters = useRotatingCharacters(characters, HERO_SLOT_COUNT, HERO_ROTATE_MS);

  useEffect(() => {
    fetch("/api/library-characters")
      .then((r) => r.json())
      .then(setLibraryImages)
      .catch(() => {});
  }, []);

  return (
    <>
      <Head>
        <title>StoryNest — Personalized storybooks for Nigerian children</title>
        <meta
          name="description"
          content="Create a personalized bedtime story starring your child, with African and Western characters. Choose a character, fill a template, download your storybook in minutes."
        />
        <meta property="og:title" content="StoryNest" />
        <meta property="og:description" content="Every Nigerian child deserves a story where they're the hero." />
      </Head>

      <main className="bg-ivory_cloth text-charcoal">
        {/* HERO */}
        <section className="relative overflow-hidden bg-indigo_night text-ivory_cloth">
          {/* Ambient background: 2 character portraits at a time, at low
              opacity, crossfading to a new pair every few seconds — an
              earlier version continuously slid 3 across the screen, which
              read as a UI ticker rather than calm background art. Reuses
              the same .animate-fade-in keyframe already used for the
              generation-progress modal's rotating facts, keyed by
              character id so React remounts (and re-plays the fade) each
              time the pair changes. object-top (not the default "center")
              is deliberate: a square source image inside a taller-than-
              wide slot can crop vertically depending on exact screen
              proportions, and if it does, this guarantees it sacrifices
              the feet, never the head — a real reported bug otherwise.
              Uses only already-cached images (see /api/library-characters,
              a pure cache read); a marketing page with anonymous,
              often bot/crawler traffic is the wrong place to spend real
              image-API money warming a cache. */}
          <div className="absolute inset-0 overflow-hidden">
            <div className="flex h-full">
              {heroCharacters.map((c) => (
                <div key={c.id} className="h-full w-1/2 animate-fade-in-slow opacity-[0.16]">
                  {libraryImages[c.id] ? (
                    <img src={libraryImages[c.id]} alt="" className="h-full w-full object-cover object-top" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-ivory_cloth/5">
                      <span className="font-display text-9xl text-ivory_cloth">{c.name[0]}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="relative z-10 mx-auto max-w-5xl px-6 pt-6">
            <div className="flex items-center justify-between">
              <p className="font-body font-semibold text-marigold">StoryNest</p>
              <Link href="/account" className="font-body text-sm text-ivory_cloth/70 hover:text-ivory_cloth">
                Log in / My Library
              </Link>
            </div>
          </div>
          <div className="relative z-10 mx-auto max-w-5xl px-6 pb-20 pt-10 md:pt-16">
            <h1 className="mt-4 max-w-2xl font-display text-4xl leading-[1.1] md:text-6xl">
              Every Nigerian child deserves a story where they're the hero.
            </h1>
            <p className="mt-6 max-w-md font-body text-lg text-ivory_cloth/85">
              Pick a character who looks and sounds like your child, fill in a few details, and hold a
              finished storybook in your hands before bedtime.
            </p>
            <div className="mt-8 flex flex-wrap gap-4">
              <Link
                href="/characters"
                className="rounded-cloth bg-coral_ember px-7 py-3 font-body font-bold text-white transition hover:bg-coral_ember/90"
              >
                Create your first story
              </Link>
              <a
                href="#how-it-works"
                className="rounded-cloth border border-ivory_cloth/40 px-7 py-3 font-body font-semibold text-ivory_cloth"
              >
                See how it works
              </a>
            </div>
          </div>

          <div className="relative z-10 cloth-trim" />
        </section>

        {/* HOW IT WORKS */}
        <section id="how-it-works" className="mx-auto max-w-5xl px-6 py-16">
          <h2 className="font-display text-3xl">How it works</h2>
          <div className="mt-10 grid gap-8 md:grid-cols-3">
            {steps.map((s) => (
              <div key={s.n}>
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo_night font-display text-lg text-marigold">
                  {s.n}
                </div>
                <h3 className="mt-4 font-display text-xl">{s.title}</h3>
                <p className="mt-2 font-body text-charcoal/80">{s.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* CHARACTER PREVIEW */}
        <section className="bg-white/60 py-16">
          <div className="mx-auto max-w-5xl px-6">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <h2 className="font-display text-3xl">Meet a few of the characters</h2>
              <Link href="/characters" className="font-body font-semibold text-coral_ember">
                Browse all 30
              </Link>
            </div>
            <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
              {sampleCharacters.map((c) => (
                <div key={c.id} className="rounded-cloth bg-ivory_cloth p-4 text-center shadow-sm">
                  <div className="mx-auto mb-3 aspect-square w-full overflow-hidden rounded-cloth bg-indigo_night/10">
                    {libraryImages[c.id] ? (
                      <img src={libraryImages[c.id]} alt={c.name} className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center font-display text-2xl text-indigo_night/40">
                        {c.name[0]}
                      </div>
                    )}
                  </div>
                  <p className="font-body font-bold">{c.name}</p>
                  <p className="font-body text-sm text-charcoal/60">{c.trait}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* PRICING */}
        <section className="mx-auto max-w-5xl px-6 py-16">
          <h2 className="font-display text-3xl">Pricing</h2>
          <div className="mt-10 grid gap-6 md:grid-cols-3">
            {pricing.map((tier) => (
              <div
                key={tier.name}
                className={`rounded-cloth border p-6 ${
                  tier.featured ? "border-coral_ember bg-white shadow-lg" : "border-charcoal/10 bg-white/60"
                }`}
              >
                <p className="font-body font-bold uppercase tracking-wide text-charcoal/60">{tier.name}</p>
                <p className="mt-3 font-display text-2xl">{tier.price}</p>
                <p className="font-body text-sm text-charcoal/60">{tier.unit}</p>
                <ul className="mt-6 space-y-2 font-body text-sm">
                  {tier.features.map((f) => (
                    <li key={f} className="flex gap-2">
                      <span className="text-leaf">✓</span> {f}
                    </li>
                  ))}
                </ul>
                {tier.name === "Premium" && (
                  <Link
                    href="/premium-builder"
                    className="mt-6 block rounded-cloth bg-coral_ember px-4 py-2 text-center font-body font-bold text-white"
                  >
                    Start Premium story
                  </Link>
                )}
                {tier.name === "Subscription" && (
                  <Link
                    href="/subscribe"
                    className="mt-6 block rounded-cloth border border-charcoal/20 px-4 py-2 text-center font-body font-bold"
                  >
                    See subscription plans
                  </Link>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* TESTIMONIALS placeholder */}
        <section className="bg-indigo_night/5 py-16">
          <div className="mx-auto max-w-3xl px-6 text-center">
            <h2 className="font-display text-3xl">What parents will say</h2>
            <p className="mt-4 font-body italic text-charcoal/60">
              Testimonials go here once your first families share their stories.
            </p>
          </div>
        </section>

        {/* FINAL CTA */}
        <section className="mx-auto max-w-5xl px-6 py-16 text-center">
          <h2 className="font-display text-3xl">Ready to make your child the hero?</h2>
          <Link
            href="/characters"
            className="mt-6 inline-block rounded-cloth bg-coral_ember px-8 py-3 font-body font-bold text-white"
          >
            Create your first story
          </Link>
        </section>

        <div className="cloth-trim--night" />
        <footer className="bg-indigo_night py-10 text-ivory_cloth/70">
          <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-6 font-body text-sm">
            <p>© {new Date().getFullYear()} StoryNest</p>
            <div className="flex gap-6">
              <Link href="/characters">Characters</Link>
              <a href="mailto:hello@storynest.app">Contact</a>
              <a href="https://instagram.com" target="_blank" rel="noreferrer">Instagram</a>
            </div>
          </div>
        </footer>
      </main>
    </>
  );
}

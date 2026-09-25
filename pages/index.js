import { useEffect, useState } from "react";
import Head from "next/head";
import Link from "next/link";
import ThemeToggle from "@/components/ThemeToggle";

// The old landing page described a completely different product — 30
// fixed hardcoded characters, per-book Naira pricing, photo-upload
// premium tiers. None of that exists anymore. This is a full rewrite
// grounded in what Derek actually does today: a curated library of
// illustrated, narrated African-first storybooks (every plan), plus
// AI-personalized stories a parent builds with their own chosen or
// custom character (Family plan), read through a PIN-locked Reading
// Mode built for a child to use unsupervised.
//
// Pricing is deliberately NOT restated here with specific Naira
// figures — those are still explicitly flagged as placeholders
// elsewhere in the codebase (see Plan.priceMinorUnits), and a public
// marketing page is the worst place to publish a number that's likely
// to change. Plans are described by what they include; /upgrade is
// the source of truth for actual pricing.

const HERO_IMG = "/hero.png"; // same real generated image across all three slides — "don't repeat the same FORMAT" was about layout arrangement, not requiring three separate illustrations

// Three genuinely different compositions, not one layout mirrored or
// recolored three times — text-left/art-right with a visible spine
// (echoing the reader's own open-book treatment), art-left/text-right
// on a bold color block instead, and a fully stacked, centered
// structure with no side-by-side split at all.
// A single consistent height across all three slides — the previous
// version had each slide structured completely differently (a split
// panel, a reversed split panel, a fully stacked centered card), which
// meant the hero visibly resized as slides changed. This constant is
// shared by all three so switching slides never shifts anything else
// on the page.
const HERO_HEIGHT = "h-[420px] md:h-[480px]";

function SlideMind() {
  // Full-bleed image filling the entire banner, headline overlaid
  // directly on top with a text stroke for legibility against
  // whatever's behind it — deliberately different from slides 2/3's
  // split-panel structure, per the explicit brief for this one.
  return (
    <div className={`relative mx-auto w-full max-w-4xl overflow-hidden rounded-cloth shadow-2xl ${HERO_HEIGHT}`}>
      {/* eslint-disable-next-line @next/next/no-img-element -- local static asset */}
      <img src={HERO_IMG} alt="" className="absolute inset-0 h-full w-full object-cover" />
      <div className="absolute inset-0 flex items-center justify-center bg-black/15 px-6">
        <h1
          className="text-center font-display text-4xl leading-tight text-white md:text-6xl"
          style={{ WebkitTextStroke: "2px rgb(43 27 61)", textShadow: "0 4px 16px rgba(0,0,0,0.35)" }}
        >
          Nurture your child's Mind.
        </h1>
      </div>
    </div>
  );
}

function SlideCuriosity() {
  // The shared template every slide's overall SIZE now matches: text
  // on the left, illustration filling the right half, both sides at
  // the full fixed height.
  return (
    <div className={`mx-auto flex w-full max-w-4xl overflow-hidden rounded-cloth shadow-2xl ${HERO_HEIGHT}`}>
      <div className="flex flex-1 flex-col justify-center bg-surface px-8 py-8 md:px-14">
        <h1 className="font-display text-3xl leading-tight text-charcoal md:text-5xl">Fuel your child's Curiosity.</h1>
        <p className="mt-4 font-body text-base text-charcoal/70 md:mt-5 md:text-lg">
          Every story is written around what your child actually loves —
          their interests shape the theme, the questions, the world they
          get to explore.
        </p>
        <div className="mt-6 flex flex-wrap gap-3 md:mt-8">
          <Link href="/login" className="rounded-full bg-coral_ember px-6 py-3 font-body font-bold text-white shadow-sm md:px-7 md:py-3.5">Get started</Link>
          <a href="#how-it-works" className="rounded-full border-2 border-charcoal/15 px-6 py-3 font-body font-bold text-charcoal md:px-7 md:py-3.5">See how it works</a>
        </div>
      </div>
      <div className="flex flex-1 items-center justify-center overflow-hidden bg-leaf">
        {/* eslint-disable-next-line @next/next/no-img-element -- local static asset */}
        <img src={HERO_IMG} alt="" className="h-full w-full object-cover" />
      </div>
    </div>
  );
}

function SlideDreams() {
  // Same template as SlideCuriosity, mirrored — illustration on the
  // left this time, text on the right — rather than a different
  // structure entirely.
  return (
    <div className={`mx-auto flex w-full max-w-4xl overflow-hidden rounded-cloth shadow-2xl ${HERO_HEIGHT}`}>
      <div className="flex flex-1 items-center justify-center overflow-hidden bg-indigo_night">
        {/* eslint-disable-next-line @next/next/no-img-element -- local static asset */}
        <img src={HERO_IMG} alt="" className="h-full w-full object-cover" />
      </div>
      <div className="flex flex-1 flex-col justify-center bg-surface px-8 py-8 md:px-14">
        <h1 className="font-display text-3xl leading-tight text-charcoal md:text-5xl">Inspire your child's Dreams.</h1>
        <p className="mt-4 font-body text-base text-charcoal/70 md:mt-5 md:text-lg">
          A story that ends with them in it — illustrated, narrated, and
          theirs alone. The last thing they see before they close their eyes.
        </p>
        <div className="mt-6 flex flex-wrap gap-3 md:mt-8">
          <Link href="/login" className="rounded-full bg-coral_ember px-6 py-3 font-body font-bold text-white shadow-sm md:px-7 md:py-3.5">Get started</Link>
          <a href="#how-it-works" className="rounded-full border-2 border-charcoal/15 px-6 py-3 font-body font-bold text-charcoal md:px-7 md:py-3.5">See how it works</a>
        </div>
      </div>
    </div>
  );
}

const SLIDES = [SlideMind, SlideCuriosity, SlideDreams];
const SLIDE_INTERVAL_MS = 7000;

function HeroSlideshow() {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setIndex((i) => (i + 1) % SLIDES.length), SLIDE_INTERVAL_MS);
    return () => clearInterval(timer);
  }, []);

  const Slide = SLIDES[index];

  return (
    <div>
      <Slide />
      <div className="mt-6 flex justify-center gap-2">
        {SLIDES.map((_, i) => (
          <button
            key={i}
            onClick={() => setIndex(i)}
            aria-label={`Show slide ${i + 1}`}
            className={`h-2.5 rounded-full transition-all ${i === index ? "w-8 bg-coral_ember" : "w-2.5 bg-charcoal/20"}`}
          />
        ))}
      </div>
    </div>
  );
}

function LibraryCard() {
  return (
    <div className="rounded-cloth bg-surface p-8 shadow-sm">
      <p className="font-display text-2xl text-charcoal">Explore the library</p>
      <p className="mt-3 font-body text-charcoal/70">
        A growing collection of African-first storybooks — fully illustrated, narrated
        aloud, and ready to print. Assign a book to your child, and they can read or
        listen to it whenever they like.
      </p>
      <p className="mt-6 font-body text-sm font-semibold text-leaf">Included on every plan</p>
    </div>
  );
}

function CreateCard() {
  return (
    <div className="rounded-cloth bg-charcoal p-8 text-ivory_cloth shadow-sm">
      <p className="font-display text-2xl">Create your own</p>
      <p className="mt-3 font-body text-ivory_cloth/80">
        Describe a story, and Derek writes it — starring your child, or a character
        you design yourself: their look, their personality, reused across every future
        story. Then we illustrate it, narrate it, and give it a real cover.
      </p>
      <p className="mt-6 font-body text-sm font-semibold text-marigold">Family plan</p>
    </div>
  );
}

const steps = [
  {
    n: 1,
    title: "Pick or create a character",
    body: "Use your child as the star, choose from characters your family has already made, or design a brand new one — their hair, their clothes, their personality.",
  },
  {
    n: 2,
    title: "Tell us what the story's about",
    body: "A theme, a lesson, a setting — as much or as little as you want to describe. Derek writes the rest.",
  },
  {
    n: 3,
    title: "Review, edit, approve",
    body: "Read it over, change anything you like, regenerate if it's not quite right. Nothing is saved until you approve it.",
  },
  {
    n: 4,
    title: "Illustrate, narrate, print",
    body: "Add full-page illustrations and a read-aloud voice, generate a cover, and get a print-ready book — all from the same story.",
  },
];

export default function Home() {
  return (
    <>
      <Head>
        <title>Derek — Stories that shape who they become.</title>
        <meta
          name="description"
          content="Explore a library of illustrated, narrated African-first storybooks, or create your own personalized story with a character your family designs. Safe for your child to read on their own."
        />
        <meta property="og:title" content="Derek" />
        <meta
          property="og:description"
          content="A storybook that stars your child — illustrated, narrated, and safe for them to open on their own."
        />
      </Head>

      <main className="bg-ivory_cloth text-charcoal">
        <nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
          <div className="text-left">
            <span className="font-display text-xl text-indigo_night">Derek</span>
            <p className="font-body text-xs text-leaf">Stories that shape who they become.</p>
          </div>
          <div className="flex items-center gap-4">
            <ThemeToggle />
            <Link href="/login" className="font-body font-semibold text-charcoal/70">
              Log in
            </Link>
          </div>
        </nav>

        <section className="px-6 pb-20 pt-6">
          <HeroSlideshow />
        </section>

        <section className="mx-auto max-w-5xl px-6 py-16">
          <div className="grid gap-6 md:grid-cols-2">
            <LibraryCard />
            <CreateCard />
          </div>
        </section>

        <section id="how-it-works" className="bg-surface py-20">
          <div className="mx-auto max-w-5xl px-6">
            <h2 className="font-display text-3xl">Building your own story</h2>
            <div className="mt-10 grid gap-10 md:grid-cols-2">
              {steps.map((s) => (
                <div key={s.n} className="flex gap-5">
                  <span className="font-display text-3xl text-coral_ember">{s.n}</span>
                  <div>
                    <p className="font-body text-lg font-bold">{s.title}</p>
                    <p className="mt-1 font-body text-charcoal/70">{s.body}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-5xl px-6 py-20">
          <div className="grid items-center gap-10 md:grid-cols-2">
            <div>
              <h2 className="font-display text-3xl">Built for a child to open on their own</h2>
              <p className="mt-4 font-body text-charcoal/70">
                Reading Mode locks the app down to just your child's own assigned
                books — nothing else is reachable. Leaving it needs a PIN only you
                know, so handing over the phone is actually safe to do.
              </p>
            </div>
            <div className="rounded-cloth bg-indigo_night p-10 text-center text-ivory_cloth">
              <p className="font-display text-5xl">🔒</p>
              <p className="mt-4 font-body font-semibold">Parent exit, PIN required</p>
            </div>
          </div>
        </section>

        <section className="bg-charcoal py-20 text-center text-ivory_cloth">
          <h2 className="font-display text-3xl">Start reading tonight</h2>
          <p className="mx-auto mt-4 max-w-md font-body text-ivory_cloth/70">
            Create a family account, add your child, and open your first book in
            minutes.
          </p>
          <Link
            href="/login"
            className="mt-8 inline-block rounded-full bg-coral_ember px-8 py-3.5 font-body font-bold text-white"
          >
            Get started
          </Link>
        </section>

        <footer className="px-6 py-10 text-center font-body text-sm text-charcoal/40">
          Derek
        </footer>
      </main>
    </>
  );
}

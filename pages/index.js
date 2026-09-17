import { useEffect, useState } from "react";
import Head from "next/head";
import Link from "next/link";
import ThemeToggle from "@/components/ThemeToggle";

// The old landing page described a completely different product — 30
// fixed hardcoded characters, per-book Naira pricing, photo-upload
// premium tiers. None of that exists anymore. This is a full rewrite
// grounded in what StoryNest actually does today: a curated library of
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
function SlideMind() {
  return (
    <div className="relative mx-auto flex w-full max-w-4xl flex-col overflow-hidden rounded-cloth bg-surface shadow-2xl md:flex-row">
      <div
        className="pointer-events-none absolute inset-y-0 left-1/2 z-0 hidden w-6 -translate-x-1/2 md:block"
        style={{ background: "linear-gradient(90deg, rgba(0,0,0,0.10), rgba(0,0,0,0.02) 20%, rgba(0,0,0,0.02) 80%, rgba(0,0,0,0.10))" }}
      />
      <div className="relative z-10 flex flex-1 aspect-video items-center justify-center overflow-hidden bg-indigo_night md:aspect-square">
        {/* eslint-disable-next-line @next/next/no-img-element -- local static asset */}
        <img src={HERO_IMG} alt="" className="h-full w-full object-cover" />
      </div>
      <div className="relative z-10 flex flex-1 flex-col justify-center py-10 pr-10 pl-14 md:py-14 md:pr-14 md:pl-20">
        <h1 className="font-display text-4xl leading-tight text-charcoal md:text-5xl">Nurture your child's Mind.</h1>
        <p className="mt-5 font-body text-lg text-charcoal/70">
          Explore a growing library of illustrated, narrated stories, or build one from
          scratch — starring a character you create, in a book your child can open,
          read, and listen to on their own.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/login" className="rounded-full bg-coral_ember px-7 py-3.5 font-body font-bold text-white shadow-sm">Get started</Link>
          <a href="#how-it-works" className="rounded-full border-2 border-charcoal/15 px-7 py-3.5 font-body font-bold text-charcoal">See how it works</a>
        </div>
      </div>
    </div>
  );
}

function SlideCuriosity() {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col overflow-hidden rounded-cloth shadow-2xl md:flex-row-reverse">
      <div className="flex flex-1 aspect-video items-center justify-center overflow-hidden bg-leaf md:aspect-square">
        {/* eslint-disable-next-line @next/next/no-img-element -- local static asset */}
        <img src={HERO_IMG} alt="" className="h-full w-full object-cover opacity-95" />
      </div>
      <div className="flex flex-1 flex-col justify-center bg-indigo_night px-10 py-10 text-ivory_cloth md:px-16 md:py-14">
        <div className="mb-4 flex gap-1.5">
          <span className="h-2 w-8 rounded-full bg-coral_ember" />
          <span className="h-2 w-8 rounded-full bg-marigold" />
          <span className="h-2 w-8 rounded-full bg-leaf" />
        </div>
        <h1 className="font-display text-4xl leading-tight md:text-5xl">Fuel your child's Curiosity.</h1>
        <p className="mt-5 font-body text-lg text-ivory_cloth/75">
          Every story is written around what your child actually loves —
          their interests shape the theme, the questions, the world they
          get to explore.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/login" className="rounded-full bg-marigold px-7 py-3.5 font-body font-bold text-indigo_night shadow-sm">Get started</Link>
          <a href="#how-it-works" className="rounded-full border-2 border-ivory_cloth/30 px-7 py-3.5 font-body font-bold text-ivory_cloth">See how it works</a>
        </div>
      </div>
    </div>
  );
}

function SlideDreams() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col items-center rounded-cloth bg-surface p-8 text-center shadow-2xl md:p-14">
      <span className="rounded-full bg-coral_ember/10 px-4 py-1.5 font-body text-sm font-bold text-coral_ember">✨ Bedtime, reimagined</span>
      <h1 className="mt-5 font-display text-4xl leading-tight text-charcoal md:text-5xl">Inspire your child's Dreams.</h1>
      <p className="mt-5 max-w-lg font-body text-lg text-charcoal/70">
        A story that ends with them in it — illustrated, narrated, and
        theirs alone. The last thing they see before they close their eyes.
      </p>
      <Link href="/login" className="mt-7 rounded-full bg-coral_ember px-8 py-3.5 font-body font-bold text-white shadow-sm">Get started</Link>
      <div className="mt-8 w-full overflow-hidden rounded-cloth shadow-lg">
        {/* eslint-disable-next-line @next/next/no-img-element -- local static asset */}
        <img src={HERO_IMG} alt="" className="w-full object-cover" style={{ maxHeight: "280px" }} />
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
        Describe a story, and StoryNest writes it — starring your child, or a character
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
    body: "A theme, a lesson, a setting — as much or as little as you want to describe. StoryNest writes the rest.",
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
        <title>StoryNest — A storybook that stars your child</title>
        <meta
          name="description"
          content="Explore a library of illustrated, narrated African-first storybooks, or create your own personalized story with a character your family designs. Safe for your child to read on their own."
        />
        <meta property="og:title" content="StoryNest" />
        <meta
          property="og:description"
          content="A storybook that stars your child — illustrated, narrated, and safe for them to open on their own."
        />
      </Head>

      <main className="bg-ivory_cloth text-charcoal">
        <nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
          <span className="font-display text-xl">StoryNest</span>
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
          StoryNest
        </footer>
      </main>
    </>
  );
}

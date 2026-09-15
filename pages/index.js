import Head from "next/head";
import Link from "next/link";

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

function OpenBookHero() {
  // Echoes the reader's own two-page-spread treatment (a shared
  // surface with a visible center spine, not two separate cards) —
  // deliberate, since that's the product's own most characteristic
  // moment, not a decorative flourish borrowed from elsewhere.
  return (
    <div className="relative mx-auto flex w-full max-w-4xl flex-col overflow-hidden rounded-cloth bg-ivory_cloth shadow-2xl md:flex-row">
      <div
        className="pointer-events-none absolute inset-y-0 left-1/2 hidden w-10 -translate-x-1/2 md:block"
        style={{
          background:
            "linear-gradient(90deg, rgba(0,0,0,0.10), rgba(0,0,0,0.02) 20%, rgba(0,0,0,0.02) 80%, rgba(0,0,0,0.10))",
        }}
      />
      <div className="relative flex flex-1 items-center justify-center overflow-hidden bg-indigo_night md:aspect-square">
        {/* Generated once via scripts/generate-hero-image.js using the
            app's own OpenAI image pipeline — a real illustrated image,
            not hand-coded SVG shapes (two earlier attempts at that
            didn't read as intended). Run the script locally before
            deploying; it writes directly to public/hero.png, which
            this just references as a plain static file. */}
        {/* eslint-disable-next-line @next/next/no-img-element -- a
            locally generated static asset, not something next/image's
            remote-pattern config is set up for */}
        <img src="/hero.png" alt="" className="h-full w-full object-cover" />
      </div>

      <div className="relative flex flex-1 flex-col justify-center p-10 md:p-14">
        <h1 className="font-display text-4xl leading-tight text-charcoal md:text-5xl">
          Get intentional! Shape your child's mind with stories
        </h1>
        <p className="mt-5 font-body text-lg text-charcoal/70">
          Explore a growing library of illustrated, narrated stories, or build one from
          scratch — starring a character you create, in a book your child can open,
          read, and listen to on their own.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/login"
            className="rounded-cloth bg-coral_ember px-7 py-3.5 font-body font-bold text-white shadow-sm"
          >
            Get started
          </Link>
          <a
            href="#how-it-works"
            className="rounded-cloth border-2 border-charcoal/15 px-7 py-3.5 font-body font-bold text-charcoal"
          >
            See how it works
          </a>
        </div>
      </div>
    </div>
  );
}

function LibraryCard() {
  return (
    <div className="rounded-cloth bg-white p-8 shadow-sm">
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
          <Link href="/login" className="font-body font-semibold text-charcoal/70">
            Log in
          </Link>
        </nav>

        <section className="px-6 pb-20 pt-6">
          <OpenBookHero />
        </section>

        <section className="mx-auto max-w-5xl px-6 py-16">
          <div className="grid gap-6 md:grid-cols-2">
            <LibraryCard />
            <CreateCard />
          </div>
        </section>

        <section id="how-it-works" className="bg-white py-20">
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
            className="mt-8 inline-block rounded-cloth bg-coral_ember px-8 py-3.5 font-body font-bold text-white"
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

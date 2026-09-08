import { useEffect, useMemo, useState } from "react";
import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { characters, ethnicities, ageBand } from "@/data/characters";

const ageBands = ["Toddler (3–5)", "Young (6–8)", "Older (9–12)"];

export default function Characters() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [ageFilter, setAgeFilter] = useState("All");
  const [genderFilter, setGenderFilter] = useState("All");
  const [ethnicityFilter, setEthnicityFilter] = useState("All");
  const [selected, setSelected] = useState(null);
  const [libraryImages, setLibraryImages] = useState({});

  useEffect(() => {
    fetch("/api/library-characters")
      .then((r) => r.json())
      .then(setLibraryImages)
      .catch(() => {});
  }, []);

  // Warm the cache for a character the moment someone looks at it closely —
  // shared across every parent using the app, so the first person to view
  // a character generates it and everyone after gets the identical cached
  // image (see /api/get-or-generate-character).
  function warmCache(id) {
    if (libraryImages[id]) return;
    fetch("/api/get-or-generate-character", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ characterId: id }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data?.imageUrl) setLibraryImages((m) => ({ ...m, [id]: data.imageUrl }));
      })
      .catch(() => {});
  }

  const filtered = useMemo(() => {
    return characters.filter((c) => {
      if (query && !c.name.toLowerCase().includes(query.toLowerCase())) return false;
      if (ageFilter !== "All" && ageBand(c.age) !== ageFilter) return false;
      if (genderFilter !== "All" && c.gender !== genderFilter) return false;
      if (ethnicityFilter !== "All" && c.ethnicity !== ethnicityFilter) return false;
      return true;
    });
  }, [query, ageFilter, genderFilter, ethnicityFilter]);

  function chooseCharacter(c) {
    router.push(`/story-builder?character=${c.id}`);
  }

  function openCharacter(c) {
    setSelected(c);
    warmCache(c.id);
  }

  return (
    <>
      <Head>
        <title>Choose a character — StoryNest</title>
      </Head>
      <main className="min-h-screen bg-ivory_cloth text-charcoal">
        <header className="mx-auto flex max-w-5xl items-center justify-between px-6 py-6">
          <Link href="/" className="font-display text-xl">StoryNest</Link>
          <Link href="/" className="font-body text-sm text-charcoal/60">← Back to home</Link>
        </header>

        <div className="mx-auto max-w-5xl px-6 pb-6">
          <h1 className="font-display text-3xl">Choose your child's character</h1>
          <p className="mt-2 font-body text-charcoal/70">30 characters across five backgrounds. Filter, search, or just browse.</p>

          <div className="mt-6 flex flex-wrap gap-3">
            <input
              type="search"
              placeholder="Search by name"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="rounded-cloth border border-charcoal/15 bg-white px-4 py-2 font-body"
            />
            <select value={ageFilter} onChange={(e) => setAgeFilter(e.target.value)} className="rounded-cloth border border-charcoal/15 bg-white px-4 py-2 font-body">
              <option>All</option>
              {ageBands.map((a) => <option key={a}>{a}</option>)}
            </select>
            <select value={genderFilter} onChange={(e) => setGenderFilter(e.target.value)} className="rounded-cloth border border-charcoal/15 bg-white px-4 py-2 font-body">
              <option>All</option>
              <option value="female">Female</option>
              <option value="male">Male</option>
            </select>
            <select value={ethnicityFilter} onChange={(e) => setEthnicityFilter(e.target.value)} className="rounded-cloth border border-charcoal/15 bg-white px-4 py-2 font-body">
              <option>All</option>
              {ethnicities.map((e) => <option key={e}>{e}</option>)}
            </select>
          </div>
        </div>

        <div className="mx-auto grid max-w-5xl grid-cols-2 gap-4 px-6 pb-20 sm:grid-cols-3 md:grid-cols-4">
          {filtered.map((c) => (
            <button
              key={c.id}
              onClick={() => openCharacter(c)}
              className="rounded-cloth bg-white p-4 text-left shadow-sm transition hover:shadow-md"
            >
              <div className="mb-3 flex aspect-square items-center justify-center overflow-hidden rounded-cloth bg-indigo_night/10 p-3 font-display text-3xl text-indigo_night/40">
                {libraryImages[c.id] ? (
                  <img src={libraryImages[c.id]} alt={c.name} className="h-full w-full object-contain" />
                ) : (
                  c.name[0]
                )}
              </div>
              <p className="font-body font-bold">{c.name}</p>
              <p className="font-body text-xs text-charcoal/60">{c.ethnicity} · {ageBand(c.age)}</p>
            </button>
          ))}
          {filtered.length === 0 && (
            <p className="col-span-full font-body text-charcoal/60">No characters match those filters — try clearing one.</p>
          )}
        </div>

        {selected && (
          <div
            className="fixed inset-0 z-20 flex items-center justify-center bg-charcoal/50 p-6"
            onClick={() => setSelected(null)}
          >
            <div
              className="max-w-sm rounded-cloth bg-white p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mx-auto mb-4 flex h-32 w-32 items-center justify-center overflow-hidden rounded-cloth bg-indigo_night/10 p-2 font-display text-4xl text-indigo_night/40">
                {libraryImages[selected.id] ? (
                  <img src={libraryImages[selected.id]} alt={selected.name} className="h-full w-full object-contain" />
                ) : (
                  selected.name[0]
                )}
              </div>
              <h2 className="text-center font-display text-2xl">{selected.name}</h2>
              <p className="text-center font-body text-sm text-charcoal/60">
                {selected.ethnicity} · Age {selected.age} · {selected.trait}
              </p>
              <p className="mt-4 font-body text-charcoal/80">{selected.description}</p>
              <div className="mt-6 flex gap-3">
                <button
                  onClick={() => setSelected(null)}
                  className="flex-1 rounded-cloth border border-charcoal/20 px-4 py-2 font-body"
                >
                  Close
                </button>
                <button
                  onClick={() => chooseCharacter(selected)}
                  className="flex-1 rounded-cloth bg-coral_ember px-4 py-2 font-body font-bold text-white"
                >
                  Use this character
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </>
  );
}

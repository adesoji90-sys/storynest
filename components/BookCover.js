// A book cover rendered at a slight angle with edge-shadow shading to
// read as a physical object rather than a flat rectangle — a real,
// if intentionally modest, "3D mockup" effect achieved with a CSS
// perspective + rotateY transform and two gradient overlays (a dark
// edge along the spine side simulating page thickness, a light sheen
// suggesting a glossy cover), not a full pseudo-3D page-block
// extrusion, which is harder to get right without live visual
// iteration. Straightens on hover as a small interactive touch.
//
// Falls back to a plain color block with the title when no cover
// exists yet (curated books not yet illustrated, or a custom book
// where "Illustrate this book" hasn't been run) — this is the common
// case for a while after Step 15 ships, not a rare edge case, so it
// needs to look intentional, not broken.
export default function BookCover({ coverUrl, title, className = "" }) {
  return (
    <div className={`shrink-0 ${className}`} style={{ perspective: "1000px" }}>
      <div
        className="relative aspect-[2/3] w-full overflow-hidden rounded-r-md shadow-xl transition-transform duration-300 hover:[transform:rotateY(4deg)]"
        style={{ transform: "rotateY(18deg)", transformStyle: "preserve-3d" }}
      >
        {coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- public bucket, dynamic per-book image
          <img src={coverUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-indigo_night p-2">
            <span className="text-center font-display text-xs leading-tight text-white">{title}</span>
          </div>
        )}
        <div className="pointer-events-none absolute inset-y-0 left-0 w-3 bg-gradient-to-r from-black/40 to-transparent" />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/20 via-transparent to-black/10" />
      </div>
    </div>
  );
}

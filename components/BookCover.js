// Rebuilt from a rotateY-transform approach that turned out to be too
// subtle at the sizes this actually renders at (w-24 in the library
// list) — a small rotation angle on a small element just reads as a
// slightly narrower flat image, not a tilted book, which is exactly
// the feedback that led to this rewrite. This version uses a more
// robust, well-established technique instead: a stack of offset
// rectangles behind the cover simulating page thickness, which reads
// clearly as "a book" regardless of size, rather than depending on a
// rotation angle being perceptible.
//
// Falls back to a plain color block with the title when no cover
// exists yet (curated books not yet illustrated, or a custom book
// where "Illustrate this book" hasn't been run) — this is the common
// case for a while after a book is first created, not a rare edge
// case, so it needs to look intentional, not broken.
export default function BookCover({ coverUrl, title, className = "" }) {
  return (
    <div className={`group relative shrink-0 ${className}`}>
      <div className="relative aspect-[2/3] w-full">
        <div className="absolute inset-0 translate-x-1.5 translate-y-1.5 rounded-r-md bg-charcoal/15" />
        <div className="absolute inset-0 translate-x-[3px] translate-y-[3px] rounded-r-md bg-charcoal/25" />
        <div className="absolute inset-0 overflow-hidden rounded-r-md shadow-xl transition-transform duration-300 group-hover:-translate-y-1 group-hover:shadow-2xl">
          {coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- public bucket, dynamic per-book image
            <img src={coverUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-indigo_night p-2">
              <span className="text-center font-display text-xs leading-tight text-white">{title}</span>
            </div>
          )}
          <div className="pointer-events-none absolute inset-y-0 left-0 w-2 bg-gradient-to-r from-black/40 to-transparent" />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/15 via-transparent to-black/10" />
        </div>
      </div>
    </div>
  );
}

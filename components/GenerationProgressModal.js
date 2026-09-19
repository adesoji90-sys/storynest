import { useEffect, useState } from "react";

// General, defensible claims about kids and reading — not pinned to a
// specific study or number, since exact statistics in this space vary
// by source and are easy to get wrong. Worth a human review before
// real launch if you want to cite something more specific. The
// earlier version of this file also had a CROSS_SELL list referencing
// "Premium," "Basic-tier," and specific color themes ("Lagos Night to
// Savanna Sunset") — all leftover from the pre-rewrite pricing and
// theming system, describing features that no longer exist. Removed
// entirely rather than updated, since none of it maps cleanly onto the
// current Reader/Family tier structure.
const FACTS = [
  "Reading together every day helps children build vocabulary and imagination faster than screen time alone.",
  "Kids who see a character who looks and sounds like them are more likely to feel like the hero of their own story.",
  "A bedtime story is one of the simplest, most reliable ways to help a child wind down before sleep.",
  "Children often ask for the same story again and again — the repetition actually helps them learn new words.",
  "Storytelling has been a way for African communities to pass down values and history for generations.",
  "Personalized details, like a child's own name or a familiar place, can make a story much easier for them to remember.",
  "Talking through a story's ending together is a great, low-pressure way to start a conversation about feelings.",
  "A shared reading routine, even just ten minutes a night, can become a favorite part of a child's whole day.",
];

// Previously this modal only ever showed a fixed list of generic
// "steps" with no real connection to what was actually happening — it
// looked identical whether page 1 of 10 or page 9 of 10 was in
// progress, which is exactly why narration could look "stuck" or
// "not working" even when it was genuinely still running. progress
// (from a live poll of /api/books/[bookId]/generation-status) is what
// makes this show something that actually moves.
export default function GenerationProgressModal({ open, label, progress }) {
  const [messageIndex, setMessageIndex] = useState(0);

  useEffect(() => {
    if (!open) return;
    setMessageIndex(Math.floor(Math.random() * FACTS.length));
    const id = setInterval(() => setMessageIndex((i) => (i + 1) % FACTS.length), 5000);
    return () => clearInterval(id);
  }, [open]);

  if (!open) return null;

  const percentage = progress && progress.total > 0 ? Math.round((progress.completed / progress.total) * 100) : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-indigo_night/70 p-6 backdrop-blur-sm">
      <div className="w-full max-w-sm overflow-hidden rounded-cloth bg-surface shadow-2xl">
        <div className="cloth-trim" />
        <div className="p-8">
          <h2 className="text-center font-display text-2xl text-indigo_night">{label}</h2>

          {progress ? (
            <>
              <p className="mt-1 text-center font-body text-sm text-charcoal/60">
                Page {progress.completed} of {progress.total}
              </p>
              <div className="mt-4 h-3 w-full overflow-hidden rounded-full bg-charcoal/10">
                <div
                  className="h-full rounded-full bg-coral_ember transition-all duration-500"
                  style={{ width: `${percentage}%` }}
                />
              </div>
            </>
          ) : (
            <p className="mt-1 text-center font-body text-xs text-charcoal/50">Starting…</p>
          )}

          <p className="mt-6 text-center font-body text-sm text-charcoal/60">{FACTS[messageIndex]}</p>
        </div>
      </div>
    </div>
  );
}

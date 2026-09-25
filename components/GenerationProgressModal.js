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
const FACT_INTERVAL_MS = 5000;
// Half the interval — the fade-out finishes and the text swaps at this
// point, then fades back in for the remainder. A real reported
// complaint: the previous version swapped facts instantly with no
// transition at all, which reads as a jump-cut even though the actual
// 5-second duration was already correct — the abruptness made it feel
// like the text was rushing by, not the timing itself.
const FADE_MS = 400;

export default function GenerationProgressModal({ open, label, progress }) {
  const [messageIndex, setMessageIndex] = useState(0);
  const [visible, setVisible] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);

  useEffect(() => {
    if (!open) {
      setModalVisible(false);
      return;
    }
    setMessageIndex(Math.floor(Math.random() * FACTS.length));
    setVisible(true);
    // Entrance animation for the modal itself — a frame after mount, not
    // on the same tick, so the CSS transition actually has a starting
    // state to animate from rather than snapping straight to visible.
    const enter = setTimeout(() => setModalVisible(true), 20);

    const id = setInterval(() => {
      setVisible(false);
      setTimeout(() => {
        setMessageIndex((i) => (i + 1) % FACTS.length);
        setVisible(true);
      }, FADE_MS);
    }, FACT_INTERVAL_MS);

    return () => {
      clearTimeout(enter);
      clearInterval(id);
    };
  }, [open]);

  if (!open) return null;

  const percentage = progress && progress.total > 0 ? Math.round((progress.completed / progress.total) * 100) : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-indigo_night/70 p-6 backdrop-blur-sm">
      <div
        className={`w-full max-w-sm overflow-hidden rounded-cloth bg-surface shadow-2xl transition-all duration-300 ${
          modalVisible ? "translate-y-0 scale-100 opacity-100" : "translate-y-2 scale-95 opacity-0"
        }`}
      >
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

          <p
            className={`mt-6 text-center font-body text-base leading-relaxed text-charcoal/70 transition-opacity ${
              visible ? "opacity-100" : "opacity-0"
            }`}
            style={{ transitionDuration: `${FADE_MS}ms` }}
          >
            {FACTS[messageIndex]}
          </p>
        </div>
      </div>
    </div>
  );
}

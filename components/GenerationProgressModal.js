import { useEffect, useState } from "react";

// General, defensible claims about kids and reading — not pinned to a
// specific study or number, since exact statistics in this space vary by
// source and are easy to get wrong. Worth a human review before real
// launch if you want to cite something more specific.
const FACTS = [
  "Reading together every day helps children build vocabulary and imagination faster than screen time alone.",
  "Kids who see a character who looks and sounds like them are more likely to feel like the hero of their own story.",
  "A bedtime story is one of the simplest, most reliable ways to help a child wind down before sleep.",
  "Children often ask for the same story again and again — the repetition actually helps them learn new words.",
  "Storytelling has been a way for African communities to pass down values and history for generations.",
  "Personalized details, like a child's own name or a familiar place, can make a story much easier for them to remember.",
  "Talking through a story's ending together is a great, low-pressure way to start a conversation about feelings.",
  "A shared reading routine, even just ten minutes a night, can become a favorite part of a child's whole day.",
  "Stories built around a clear lesson — kindness, courage, patience — help children practice good choices in real life.",
  "Kids as young as three already start recognizing and connecting with themselves in a story's illustrations.",
];

const CROSS_SELL = [
  "💡 Making one for a sibling or cousin too? Every story is generated fresh — mix characters and themes freely.",
  "👑 Next time, try Premium — upload your child's own photo and watch them become the illustrated hero.",
  "📖 Add a supporting character from the library to any Premium story so friends can go on the adventure together.",
  "🔁 Reading every night? A StoryNest subscription gives unlimited Basic-tier stories for one flat price.",
  "📬 Your finished book arrives as a real PDF you can keep, print, or share with family right away.",
  "🎨 Eight color themes are available — from Lagos Night to Savanna Sunset — try a new one on your next book.",
];

const MESSAGES = [...FACTS, ...CROSS_SELL];

export default function GenerationProgressModal({ open, steps, currentStepIndex }) {
  const [messageIndex, setMessageIndex] = useState(0);

  useEffect(() => {
    if (!open) return;
    setMessageIndex(Math.floor(Math.random() * MESSAGES.length));
    const id = setInterval(() => {
      setMessageIndex((i) => (i + 1) % MESSAGES.length);
    }, 5000);
    return () => clearInterval(id);
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-indigo_night/70 p-6 backdrop-blur-sm">
      <div className="w-full max-w-sm overflow-hidden rounded-cloth bg-ivory_cloth shadow-2xl">
        <div className="cloth-trim" />
        <div className="p-8">
          <h2 className="text-center font-display text-2xl text-indigo_night">Building your storybook</h2>
          <p className="mt-1 text-center font-body text-xs text-charcoal/50">This usually takes under a minute</p>

          <div className="mt-6 space-y-3">
            {steps.map((label, i) => {
              const done = i < currentStepIndex;
              const active = i === currentStepIndex;
              return (
                <div key={label} className="flex items-center gap-3">
                  <span
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full font-body text-xs font-bold ${
                      done
                        ? "bg-leaf text-white"
                        : active
                        ? "animate-pulse bg-coral_ember text-white"
                        : "bg-charcoal/10 text-charcoal/40"
                    }`}
                  >
                    {done ? "✓" : i + 1}
                  </span>
                  <span
                    className={`font-body text-sm ${
                      active ? "font-bold text-charcoal" : done ? "text-charcoal/50" : "text-charcoal/40"
                    }`}
                  >
                    {label}
                  </span>
                </div>
              );
            })}
          </div>

          <div key={messageIndex} className="animate-fade-in mt-8 rounded-cloth bg-white p-4 shadow-sm">
            <p className="font-body text-sm leading-relaxed text-charcoal/80">{MESSAGES[messageIndex]}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

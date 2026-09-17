// Shared visual primitives, extracted specifically to break the
// pattern every page had fallen into independently: an identical
// white, rounded-cloth, shadow-sm box for every single piece of
// content regardless of what it was — a family card looked the same
// as a book card looked the same as a modal. Real hierarchy needs more
// than one visual treatment. These give a few clearly different
// "weights" to reach for on purpose, not a single default reused
// everywhere out of convenience.

export function Card({ children, className = "" }) {
  // The default, for ordinary content — most of what was already
  // "bg-white p-5/6 shadow-sm rounded-cloth" everywhere. bg-surface
  // (not bg-white) specifically so this flips to a proper dark panel
  // in dark mode instead of staying a bright white box — see
  // tailwind.config.js's own comment on why "surface" exists.
  return <div className={`rounded-cloth bg-surface p-6 shadow-sm ${className}`}>{children}</div>;
}

export function FeatureCard({ children, className = "" }) {
  // For the one or two things per page that should actually stand
  // out — a warm, dark card instead of another white box, reserved
  // for content genuinely worth pulling forward (a call to action, a
  // highlighted plan, a standout piece of content).
  return (
    <div className={`rounded-cloth bg-indigo_night p-6 text-ivory_cloth shadow-sm ${className}`}>{children}</div>
  );
}

export function QuietCard({ children, className = "" }) {
  // For secondary, low-emphasis content — a bordered surface instead
  // of a shadowed one, so it visually recedes next to a Card or
  // FeatureCard rather than competing with it at the same weight.
  return <div className={`rounded-cloth border border-charcoal/12 bg-transparent p-6 ${className}`}>{children}</div>;
}

export function Button({ children, variant = "primary", className = "", ...props }) {
  // rounded-full (pill) rather than rounded-cloth — Kente Bright's own
  // preview used pill-shaped buttons throughout, a deliberately bolder,
  // more playful shape than the previous theme's modest corner rounding.
  const base = "rounded-full px-5 py-2.5 font-body font-bold disabled:opacity-50";
  const variants = {
    primary: "bg-coral_ember text-white",
    dark: "bg-indigo_night text-ivory_cloth",
    outline: "border-2 border-charcoal/15 text-charcoal",
    ghost: "text-charcoal/60 font-semibold",
  };
  return (
    <button className={`${base} ${variants[variant] || variants.primary} ${className}`} {...props}>
      {children}
    </button>
  );
}

export function Badge({ children, className = "" }) {
  return (
    <span className={`rounded-full border border-charcoal/15 px-2 py-0.5 font-body text-xs text-charcoal/60 ${className}`}>
      {children}
    </span>
  );
}

export function EmptyState({ title, body, action }) {
  // An empty screen is an invitation to act, not a dead end — every
  // "nothing here yet" moment across the app should look like this
  // instead of a stray line of gray text.
  return (
    <div className="rounded-cloth border-2 border-dashed border-charcoal/15 p-10 text-center">
      <p className="font-display text-xl">{title}</p>
      {body && <p className="mt-2 font-body text-charcoal/60">{body}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

/** @type {import('tailwindcss').Config} */
module.exports = {
  // 'class' rather than 'media' — a real toggle the user controls
  // (persisted in localStorage, see components/ThemeToggle.js), not
  // just automatically following the OS's own light/dark setting with
  // no way to override it.
  darkMode: "class",
  content: [
    "./pages/**/*.{js,jsx}",
    "./components/**/*.{js,jsx}",
  ],
  theme: {
    extend: {
      // "Plum & Amber" palette — replaces Kente Bright, chosen after a
      // standalone preview. Token NAMES kept identical deliberately —
      // every page across the whole app already references these names
      // (bg-indigo_night, text-coral_ember, etc.), so swapping the
      // actual color VALUES (in styles/globals.css's CSS variables,
      // which these now reference) is what makes a new palette apply
      // everywhere at once, without needing to touch dozens of
      // individual files. Each token keeps the same semantic role it
      // always has: indigo_night = primary/dark accent, marigold = main
      // accent, coral_ember = interactive/CTA, ivory_cloth = background,
      // leaf = growth/educational green, charcoal = main text.
      colors: {
        indigo_night: "rgb(var(--color-indigo-night) / <alpha-value>)",
        marigold: "rgb(var(--color-marigold) / <alpha-value>)",
        coral_ember: "rgb(var(--color-coral-ember) / <alpha-value>)",
        ivory_cloth: "rgb(var(--color-ivory-cloth) / <alpha-value>)",
        leaf: "rgb(var(--color-leaf) / <alpha-value>)",
        charcoal: "rgb(var(--color-charcoal) / <alpha-value>)",
        // NEW — previously every card/form used a hardcoded bg-white,
        // which would stay a jarring bright box even after the rest of
        // the page went dark. "surface" is white in light mode, a dark
        // raised panel in dark mode (see globals.css). Shared components
        // (Card, FeatureCard, QuietCard in components/ui.js) now use
        // this instead of bg-white — anywhere else still using bg-white
        // directly hasn't been converted yet and will stay bright even
        // in dark mode, a known, deliberate scope limit for this pass.
        surface: "rgb(var(--color-surface) / <alpha-value>)",
      },
      fontFamily: {
        display: ["'Baloo 2'", "system-ui", "sans-serif"], // was Fraunces (literary serif) — now Baloo 2, a rounded, playful, child-first display font
        body: ["Quicksand", "system-ui", "sans-serif"],     // was Nunito Sans — now Quicksand, a softer rounded body font matching Baloo 2's mood
      },
      borderRadius: {
        cloth: "22px", // slightly larger than before (18px) — a touch more rounded, matching Kente Bright's bolder, softer-edged feel
      },
      maxWidth: {
        prose: "68ch",
      },
    },
  },
  plugins: [],
};

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./pages/**/*.{js,jsx}",
    "./components/**/*.{js,jsx}",
  ],
  theme: {
    extend: {
      colors: {
        indigo_night: "#1D1740",
        marigold: "#F2A93B",
        coral_ember: "#E85C41",
        ivory_cloth: "#FBF3E7",
        leaf: "#3F7D5C",
        charcoal: "#241F33",
      },
      fontFamily: {
        display: ["Fraunces", "Georgia", "serif"],
        body: ["'Nunito Sans'", "system-ui", "sans-serif"],
      },
      borderRadius: {
        cloth: "18px",
      },
      maxWidth: {
        prose: "68ch",
      },
    },
  },
  plugins: [],
};

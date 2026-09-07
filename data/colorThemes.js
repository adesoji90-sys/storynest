export const colorThemes = [
  { id: "savanna-sunset", name: "Savanna Sunset", bg: "#FFF8E7", text: "#5D4037", accent: "#FF8C00" },
  { id: "lagos-night", name: "Lagos Night", bg: "#1A237E", text: "#FFFFFF", accent: "#FFD700" },
  { id: "ocean-breeze", name: "Ocean Breeze", bg: "#E0F7FA", text: "#006064", accent: "#00BCD4" },
  { id: "ankara-vibrance", name: "Ankara Vibrance", bg: "#FFF3E0", text: "#3E2723", accent: "#E65100" },
  { id: "forest-calm", name: "Forest Calm", bg: "#E8F5E9", text: "#1B5E20", accent: "#4CAF50" },
  { id: "royal-purple", name: "Royal Purple", bg: "#F3E5F5", text: "#4A148C", accent: "#9C27B0" },
  { id: "harmattan-haze", name: "Harmattan Haze", bg: "#ECEFF1", text: "#37474F", accent: "#607D8B" },
  { id: "jollof-red", name: "Jollof Red", bg: "#FFEBEE", text: "#B71C1C", accent: "#F44336" },
];

export function getThemeById(id) {
  return colorThemes.find((t) => t.id === id) || colorThemes[3];
}

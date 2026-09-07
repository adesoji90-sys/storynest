// Fill-in-the-blank story templates. `fields` drives the Story Builder form —
// each field renders as text/textarea/select based on `type`.

export const lessons = [
  "Asking for help is brave",
  "Kindness always finds its way back",
  "Honesty is stronger than fear",
  "Every talent deserves a chance to shine",
  "Working together beats working alone",
];

export const templates = [
  {
    id: 1,
    title: "The Brave Adventure",
    theme: "Problem-solving, asking for help, courage",
    fields: [
      { key: "setting", label: "Where does it happen?", type: "text", placeholder: "e.g. Lagos market on Saturday morning" },
      { key: "problem", label: "What goes wrong?", type: "textarea", placeholder: "e.g. Lost favorite beaded bracelet" },
      { key: "helper", label: "Who helps? (character or name)", type: "text", placeholder: "e.g. Mama Nkechi, or another character" },
      { key: "challenge", label: "What must they do to solve it?", type: "textarea", placeholder: "e.g. Ask 5 traders for help" },
      { key: "lesson", label: "The lesson", type: "select", options: lessons },
      { key: "ending", label: "How does it end?", type: "textarea", placeholder: "e.g. Mama Nkechi found it" },
      { key: "moral_phrase", label: "One-sentence takeaway", type: "text", placeholder: "e.g. And Adaeze learned that her voice mattered." },
    ],
  },
  { id: 2, title: "The Kindness Challenge", theme: "Including others, empathy, friendship", fields: baseFields("Who gets left out at first?", "What kind thing happens?") },
  { id: 3, title: "The Mystery at School", theme: "Detective story, honesty, teamwork", fields: baseFields("What goes missing or seems strange?", "How do they investigate together?") },
  { id: 4, title: "The Magical Object", theme: "Fantasy, responsibility, creativity", fields: baseFields("What magical object do they find?", "What responsibility comes with it?") },
  { id: 5, title: "The New Friend", theme: "Social skills, overcoming shyness, acceptance", fields: baseFields("Where do they meet the new friend?", "What helps them open up?") },
  { id: 6, title: "The Sports Tournament", theme: "Teamwork, perseverance, sportsmanship", fields: baseFields("What's the tournament and the stakes?", "What setback do they face mid-game?") },
  { id: 7, title: "The Family Secret", theme: "Hidden talents, courage, self-expression", fields: baseFields("What hidden talent is discovered?", "What stops them from sharing it at first?") },
  { id: 8, title: "The Entrepreneur", theme: "Business ethics, hard work, resilience", fields: baseFields("What small business do they start?", "What honest choice do they have to make?") },
  { id: 9, title: "The Cultural Festival", theme: "Cultural pride, adaptability, sharing", fields: baseFields("Which festival or celebration is it?", "What do they share with someone new to it?") },
  { id: 10, title: "The Tech Whiz", theme: "Innovation, girls in tech, problem-solving", fields: baseFields("What everyday problem do they notice?", "What do they build or code to fix it?") },
];

function baseFields(problemLabel, challengeLabel) {
  return [
    { key: "setting", label: "Where does it happen?", type: "text", placeholder: "e.g. Enugu, during the school holidays" },
    { key: "problem", label: problemLabel, type: "textarea", placeholder: "Describe the situation" },
    { key: "helper", label: "Who helps? (character or name)", type: "text", placeholder: "Optional — leave blank for 'None'" },
    { key: "challenge", label: challengeLabel, type: "textarea", placeholder: "What has to happen next" },
    { key: "lesson", label: "The lesson", type: "select", options: lessons },
    { key: "ending", label: "How does it end?", type: "textarea", placeholder: "Wrap up the story" },
    { key: "moral_phrase", label: "One-sentence takeaway", type: "text", placeholder: "e.g. And Kemi learned that trying again is never wasted." },
  ];
}

export function getTemplateById(id) {
  return templates.find((t) => t.id === Number(id)) || null;
}

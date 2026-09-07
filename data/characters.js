// StoryNest character library.
// image fields point to /public/characters/<file> — drop in the generated
// PNGs using this same naming convention once you've run them through
// Midjourney / DALL-E 3 / Stable Diffusion (see README "Character art").

export const characters = [
  // --- Igbo (7) ---
  { id: "adaeze", name: "Adaeze", age: 6, gender: "female", ethnicity: "Igbo", trait: "Curious", description: "Braided hair with colorful beads, pink Ankara dress. Always the first to ask 'why?'", image: "/characters/character_01_adaeze_6yr_female.png" },
  { id: "chidi", name: "Chidi", age: 8, gender: "male", ethnicity: "Igbo", trait: "Energetic", description: "Football jersey #10, always mid-sprint. Believes every problem has a team solution.", image: "/characters/character_02_chidi_8yr_male.png" },
  { id: "emeka", name: "Emeka", age: 9, gender: "male", ethnicity: "Igbo", trait: "Adventurous", description: "Small scar above one eyebrow from a tree-climbing dare he'd take again.", image: "/characters/character_03_emeka_9yr_male.png" },
  { id: "nneka", name: "Nneka", age: 6, gender: "female", ethnicity: "Igbo", trait: "Gentle", description: "Cornrows tied with yellow ribbons, coral dress. Notices when someone's left out.", image: "/characters/character_04_nneka_6yr_female.png" },
  { id: "obinna", name: "Obinna", age: 11, gender: "male", ethnicity: "Igbo", trait: "Responsible", description: "Tall for his age, blue polo shirt. The one younger cousins go to first.", image: "/characters/character_05_obinna_11yr_male.png" },
  { id: "adanna", name: "Adanna", age: 8, gender: "female", ethnicity: "Igbo", trait: "Funny", description: "Missing a front tooth, striped t-shirt, a joke ready for every situation.", image: "/characters/character_06_adanna_8yr_female.png" },
  { id: "ikenna", name: "Ikenna", age: 7, gender: "male", ethnicity: "Igbo", trait: "Dreamy", description: "Curly hair, green rocket-ship t-shirt. Half his mind is always in space.", image: "/characters/character_07_ikenna_7yr_male.png" },

  // --- Yoruba (5) ---
  { id: "folake", name: "Folake", age: 5, gender: "female", ethnicity: "Yoruba", trait: "Artistic", description: "Two puff-puffs with ribbons, yellow blouse. Draws on anything that holds still.", image: "/characters/character_08_folake_5yr_female.png" },
  { id: "tunde", name: "Tunde", age: 10, gender: "male", ethnicity: "Yoruba", trait: "Smart", description: "Glasses, school uniform, a fact for every occasion.", image: "/characters/character_09_tunde_10yr_male.png" },
  { id: "kemi", name: "Kemi", age: 8, gender: "female", ethnicity: "Yoruba", trait: "Cheerful", description: "Bantu knots with hair rings, yellow 'Lagos' t-shirt, laughs with her whole body.", image: "/characters/character_10_kemi_8yr_female.png" },
  { id: "segun", name: "Segun", age: 10, gender: "male", ethnicity: "Yoruba", trait: "Artistic", description: "Short dreadlocks, paint-splattered shirt. Sees a mural where others see a wall.", image: "/characters/character_11_segun_10yr_male.png" },
  { id: "bisola", name: "Bisola", age: 7, gender: "female", ethnicity: "Yoruba", trait: "Sweet", description: "Fulani braids with cowrie shells, green buba and iro. Shares before she's asked.", image: "/characters/character_12_bisola_7yr_female.png" },

  // --- Hausa (7) ---
  { id: "zainab", name: "Zainab", age: 7, gender: "female", ethnicity: "Hausa", trait: "Confident", description: "Purple hijab with sparkly pins, purple tunic. Speaks up in every room.", image: "/characters/character_13_zainab_7yr_female.png" },
  { id: "amina", name: "Amina", age: 9, gender: "female", ethnicity: "Hausa", trait: "Determined", description: "Teal hijab with butterfly clips, pretend doctor's lab coat, plays to win.", image: "/characters/character_14_amina_9yr_female.png" },
  { id: "farouk", name: "Farouk", age: 10, gender: "male", ethnicity: "Hausa", trait: "Wise", description: "White kufi cap, white kaftan. Listens twice before he speaks once.", image: "/characters/character_15_farouk_10yr_male.png" },
  { id: "hauwa", name: "Hauwa", age: 6, gender: "female", ethnicity: "Hausa", trait: "Joyful", description: "Braids with cowrie shells, pink-and-gold traditional dress, dances at bus stops.", image: "/characters/character_16_hauwa_6yr_female.png" },
  { id: "ibrahim", name: "Ibrahim", age: 8, gender: "male", ethnicity: "Hausa", trait: "Entrepreneurial", description: "Checkered shirt, small money pouch, already has three side businesses.", image: "/characters/character_17_ibrahim_8yr_male.png" },
  { id: "mariam", name: "Mariam", age: 11, gender: "female", ethnicity: "Hausa", trait: "Tech-savvy", description: "Navy hijab with tiny tech-themed pins, denim jacket, fixes the family Wi-Fi.", image: "/characters/character_18_mariam_11yr_female.png" },
  { id: "ahmed", name: "Ahmed", age: 12, gender: "male", ethnicity: "Hausa", trait: "Mature", description: "Short beard just starting, plain white t-shirt, work boots. Acts older than he is.", image: "/characters/character_19_ahmed_12yr_male.png" },

  // --- Mixed / Diaspora (Nigeria) (4) ---
  { id: "david", name: "David", age: 7, gender: "male", ethnicity: "Mixed", trait: "Shy", description: "Freckles, grey hoodie. Nigerian-British, warms up slowly and completely.", image: "/characters/character_20_david_7yr_male.png" },
  { id: "sarah", name: "Sarah", age: 9, gender: "female", ethnicity: "Mixed", trait: "Trendy", description: "Long weave, crop top and jeans, grew up around Victoria Island, Lagos.", image: "/characters/character_21_sarah_9yr_female.png" },
  { id: "michael", name: "Michael", age: 10, gender: "male", ethnicity: "Mixed", trait: "Competitive", description: "Basketball jersey #23, keeps score even during 'just for fun' games.", image: "/characters/character_22_michael_10yr_male.png" },
  { id: "grace", name: "Grace", age: 8, gender: "female", ethnicity: "Mixed", trait: "Faithful", description: "Natural hair with a small cross pin, floral Sunday dress, prays out loud for others.", image: "/characters/character_23_grace_8yr_female.png" },

  // --- Western Diaspora (7) ---
  { id: "emma", name: "Emma", age: 7, gender: "female", ethnicity: "Western", trait: "British", description: "Blonde pigtails with red ribbons, red-and-white striped shirt, dungarees.", image: "/characters/character_24_emma_7yr_female.png" },
  { id: "liam", name: "Liam", age: 9, gender: "male", ethnicity: "Western", trait: "American", description: "Messy brown hair, navy 'California' hoodie, skateboard under one arm.", image: "/characters/character_25_liam_9yr_male.png" },
  { id: "sophia", name: "Sophia", age: 8, gender: "female", ethnicity: "Western", trait: "American", description: "Curly brown hair with a purple headband, glasses, purple sweater vest.", image: "/characters/character_26_sophia_8yr_female.png" },
  { id: "noah", name: "Noah", age: 10, gender: "male", ethnicity: "Western", trait: "Canadian", description: "Short brown hair, red-and-white hockey jersey, winter boots year-round.", image: "/characters/character_27_noah_10yr_male.png" },
  { id: "olivia", name: "Olivia", age: 6, gender: "female", ethnicity: "Western", trait: "Australian", description: "Wavy blonde hair with a blue bow, light-blue polka-dot sundress.", image: "/characters/character_28_olivia_6yr_female.png" },
  { id: "ethan", name: "Ethan", age: 11, gender: "male", ethnicity: "Western", trait: "British", description: "Curly black hair with a fade, school blazer with a crest.", image: "/characters/character_29_ethan_11yr_male.png" },
  { id: "ava", name: "Ava", age: 9, gender: "female", ethnicity: "Western", trait: "American", description: "Straight brown hair with rainbow clips, tie-dye t-shirt.", image: "/characters/character_30_ava_9yr_female.png" },
];

export const ethnicities = ["Igbo", "Yoruba", "Hausa", "Mixed", "Western"];

export function ageBand(age) {
  if (age <= 5) return "Toddler (3–5)";
  if (age <= 8) return "Young (6–8)";
  return "Older (9–12)";
}

export function getCharacterById(id) {
  return characters.find((c) => c.id === id) || null;
}

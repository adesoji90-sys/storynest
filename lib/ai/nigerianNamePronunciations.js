// A real, if partial, fix for a genuine TTS limitation: ElevenLabs'
// phoneme-tag feature (which lets you specify exact IPA/CMU
// pronunciation) only works with the eleven_flash_v2 / eleven_
// monolingual_v1 models, and even then only for English words — this
// app's eleven_multilingual_v2 doesn't support it, and Nigerian names
// aren't English words regardless. Rather than depend on a feature
// that doesn't apply here, this replaces known names with a plain
// phonetic respelling BEFORE the text reaches the TTS API — simple
// text substitution that works with any model, no special API feature
// needed.
//
// Applied only to the text sent for narration, never to what's stored
// or displayed — a child reading along still sees "Kemi" on the page,
// not "KEH-mee".
//
// Deliberately a small, STARTING list across Yoruba, Igbo, and Hausa
// names, not a comprehensive database of Nigerian names (there is no
// such finite list) — respellings are a best-effort approximation of
// syllable breaks and stress, not a perfect phonetic transcription,
// since English spelling can't fully capture every actual sound (e.g.
// Yoruba's tonal qualities). Extend this object directly with any
// other name you find mispronounced in practice — that's the
// intended way to grow it over time, not something requiring a
// larger rebuild.
const PRONUNCIATION_HINTS = {
  // Yoruba
  "kemi": "KEH-mee",
  "kehinde": "keh-HEEN-deh",
  "taiwo": "TAI-woh",
  "temitope": "teh-mee-TOH-peh",
  "folake": "foh-LAH-keh",
  "adebayo": "ah-deh-BAH-yoh",
  "oluwaseun": "oh-loo-wah-SHEH-oon",
  "damilare": "dah-mee-LAH-reh",
  "yetunde": "yeh-TOON-deh",
  "funmilayo": "foon-mee-LAH-yoh",
  "abeni": "ah-BEH-nee",
  "olamide": "oh-lah-MEE-deh",
  "ayomide": "ah-yoh-MEE-deh",
  "oluwatobi": "oh-loo-wah-TOH-bee",
  "bimpe": "BEEM-peh",
  "tunde": "TOON-deh",
  "bisi": "BEE-see",
  "wale": "WAH-leh",
  // Igbo
  "chidinma": "chee-DEEN-mah",
  "chioma": "chee-OH-mah",
  "chinwe": "CHIN-weh",
  "ngozi": "n-GOH-zee",
  "obinna": "oh-BEEN-nah",
  "emeka": "eh-MEH-kah",
  "chukwuemeka": "chook-woo-eh-MEH-kah",
  "ifeoma": "ee-feh-OH-mah",
  "nkechi": "n-KEH-chee",
  "adaeze": "ah-dah-EH-zeh",
  "chiamaka": "chee-ah-MAH-kah",
  "ikenna": "ee-KEHN-nah",
  "nnamdi": "n-NAHM-dee",
  "ekene": "eh-KEH-neh",
  // Hausa
  "aisha": "ai-EE-shah",
  "amina": "ah-MEE-nah",
  "ibrahim": "ee-brah-HEEM",
  "fatima": "fah-TEE-mah",
  "yusuf": "YOO-soof",
  "zainab": "ZAI-nahb",
  "hauwa": "HOW-wah",
  "musa": "MOO-sah",
};

export function applyPronunciationHints(text) {
  let result = text;
  for (const [name, respelling] of Object.entries(PRONUNCIATION_HINTS)) {
    // \b word boundaries + case-insensitive — matches "Kemi", "kemi",
    // or "KEMI" as a whole word only, never as part of a longer word
    // it happens to be a substring of.
    const pattern = new RegExp(`\\b${name}\\b`, "gi");
    result = result.replace(pattern, respelling);
  }
  return result;
}

// A page is "ancillary" — the auto-appended comprehension-questions
// page and closing page (see story-studio/index.js's finalPages
// construction and admin/books/index.ts's pagesWithClosing) — rather
// than real story content. These get created as real Page rows so the
// reader can display them, but they were never meant to be illustrated
// like a story scene, and counting them toward "Page X of N" in the
// progress modal is exactly why an author who wrote 8 story pages saw
// "Page 5 of 10" — the book genuinely has 10 Page rows, but only 8 are
// the story the author actually thinks of as "the book."
//
// Detected by a fixed text prefix rather than a dedicated pageType
// column — both prefixes are fully controlled by this same codebase
// (nothing external ever writes a Page starting with either string),
// so this is a reliable, low-risk check without a schema migration.
// If this pattern ever needs to get more elaborate, a real pageType
// enum column would be the cleaner long-term fix.
const ANCILLARY_PREFIXES = ["Let's talk about the story!", "The End 🎉"];

export function isAncillaryPage(text) {
  return ANCILLARY_PREFIXES.some((prefix) => text.startsWith(prefix));
}

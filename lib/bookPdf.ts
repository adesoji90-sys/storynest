// Adapted from lib/generateStoryPdf.js's core visual technique (a
// full-bleed illustration with a caption card holding the text) but
// rewritten for the current schema — the old file is built entirely
// around the OLD hardcoded character/theme data model
// (getCharacterById, getThemeById), not Book/Page/Asset, and forcing
// this new schema's data through that file's exact function signatures
// would have meant fighting its assumptions more than reusing its
// logic. This is a simpler version of the same visual idea, not a
// feature-for-feature port — no color-theme system, no back-cover
// blurb page, built specifically for what a curated Book actually has
// available (cover, per-page illustration + text, title, author).
//
// Runs server-side only (an API route, not a browser button) — safe to
// use Node's Buffer directly here, unlike the old file's own comment
// about avoiding it for browser compatibility.

import { jsPDF } from "jspdf";

const PAGE_WIDTH = 612; // US Letter, points
const PAGE_HEIGHT = 792;
const IMAGE_HEIGHT_FRACTION = 0.62; // illustration occupies the top ~62% of each page, caption card the rest

async function fetchImageAsBase64(url: string | null): Promise<string | null> {
  if (!url) return null;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    return Buffer.from(buf).toString("base64");
  } catch {
    return null;
  }
}

export async function buildBookPdfBuffer(book: {
  title: string;
  authorName: string | null;
  coverUrl: string | null;
  pages: { text: string | null; illustrationUrl: string | null }[];
}): Promise<Uint8Array> {
  const doc = new jsPDF({ unit: "pt", format: [PAGE_WIDTH, PAGE_HEIGHT] });

  // COVER
  const coverBase64 = await fetchImageAsBase64(book.coverUrl);
  if (coverBase64) {
    doc.addImage(`data:image/png;base64,${coverBase64}`, "PNG", 0, 0, PAGE_WIDTH, PAGE_HEIGHT, undefined, "FAST");
  } else {
    doc.setFillColor(35, 35, 70);
    doc.rect(0, 0, PAGE_WIDTH, PAGE_HEIGHT, "F");
  }
  // Semi-transparent dark band behind the title so it stays legible
  // over any cover art, light or dark.
  doc.setFillColor(0, 0, 0);
  doc.setGState(new (doc as any).GState({ opacity: 0.35 }));
  doc.rect(0, PAGE_HEIGHT - 160, PAGE_WIDTH, 160, "F");
  doc.setGState(new (doc as any).GState({ opacity: 1 }));

  doc.setTextColor(255, 255, 255);
  doc.setFont("times", "bold");
  doc.setFontSize(28);
  doc.text(book.title, PAGE_WIDTH / 2, PAGE_HEIGHT - 100, { align: "center", maxWidth: PAGE_WIDTH - 80 });
  if (book.authorName) {
    doc.setFont("times", "italic");
    doc.setFontSize(14);
    doc.text(`by ${book.authorName}`, PAGE_WIDTH / 2, PAGE_HEIGHT - 60, { align: "center" });
  }

  // PAGES
  const imageAreaHeight = PAGE_HEIGHT * IMAGE_HEIGHT_FRACTION;
  for (const page of book.pages) {
    doc.addPage([PAGE_WIDTH, PAGE_HEIGHT], "portrait");

    const imgBase64 = await fetchImageAsBase64(page.illustrationUrl);
    if (imgBase64) {
      doc.addImage(`data:image/png;base64,${imgBase64}`, "PNG", 0, 0, PAGE_WIDTH, imageAreaHeight, undefined, "FAST");
    } else {
      doc.setFillColor(245, 240, 230);
      doc.rect(0, 0, PAGE_WIDTH, imageAreaHeight, "F");
    }

    doc.setFillColor(255, 255, 255);
    doc.rect(0, imageAreaHeight, PAGE_WIDTH, PAGE_HEIGHT - imageAreaHeight, "F");
    doc.setTextColor(40, 40, 40);
    doc.setFont("times", "normal");
    doc.setFontSize(15);
    doc.text(page.text || "", PAGE_WIDTH / 2, imageAreaHeight + 45, {
      align: "center",
      maxWidth: PAGE_WIDTH - 100,
    });
  }

  return new Uint8Array(doc.output("arraybuffer"));
}

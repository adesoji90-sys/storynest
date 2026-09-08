// Builds the storybook-style PDF used for both the client-side "Download
// PDF" button (success.js) and the server-side email attachment
// (verify-payment.js, redeem-subscription-story.js) — one function, so the
// two can't drift apart.
//
// Deliberately avoids Node's Buffer type, which is NOT a standard browser
// global and isn't polyfilled by this project's webpack config — using it
// here would work fine server-side (Node) but silently break when this
// same function runs in the browser. Uint8Array + btoa/atob are universal
// across both environments (Node 18+ has btoa/atob as globals too), which
// is what makes one shared function safe to call from both places.

import { jsPDF } from "jspdf";
import { getCharacterById } from "@/data/characters";
import { getThemeById } from "@/data/colorThemes";

export function uint8ArrayToBase64(bytes) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

async function fetchImageAsBase64(url) {
  if (!url) return null;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    return uint8ArrayToBase64(new Uint8Array(buf));
  } catch {
    return null;
  }
}

const ACCENT_BAR_HEIGHT = 10;
const MARGIN = 48;

function fillBackground(doc, theme, pageWidth, pageHeight) {
  doc.setFillColor(theme.bg);
  doc.rect(0, 0, pageWidth, pageHeight, "F");
  doc.setTextColor(theme.text);
}

// The site's ".cloth-trim" accent, simplified for print: a solid band in
// the theme's accent color top and bottom of every page, so the PDF reads
// as unmistakably StoryNest rather than generic black-text-on-white.
function drawAccentBars(doc, theme, pageWidth, pageHeight) {
  doc.setFillColor(theme.accent);
  doc.rect(0, 0, pageWidth, ACCENT_BAR_HEIGHT, "F");
  doc.rect(0, pageHeight - ACCENT_BAR_HEIGHT, pageWidth, ACCENT_BAR_HEIGHT, "F");
}

function drawPageFooter(doc, pageWidth, pageHeight, label, theme) {
  doc.setFontSize(9);
  doc.setFont("times", "normal");
  doc.setTextColor(theme.text);
  doc.text(label, pageWidth / 2, pageHeight - ACCENT_BAR_HEIGHT - 10, { align: "center" });
}

// Circular character portrait via jsPDF's clip-path API. Wrapped
// defensively — if clipping misbehaves on a given jsPDF/environment
// combination, we fall back to a plain initial-circle rather than
// producing a broken page.
function drawCircularImage(doc, base64, cx, cy, r) {
  try {
    doc.saveGraphicsState();
    doc.circle(cx, cy, r, null);
    doc.clip();
    doc.discardPath();
    doc.addImage(`data:image/png;base64,${base64}`, "PNG", cx - r, cy - r, r * 2, r * 2);
    doc.restoreGraphicsState();
    return true;
  } catch {
    return false;
  }
}

function drawFallbackPortrait(doc, theme, cx, cy, r, initial) {
  doc.setFillColor(theme.accent);
  doc.circle(cx, cy, r, "F");
  doc.setTextColor(theme.bg);
  doc.setFont("times", "bold");
  doc.setFontSize(36);
  doc.text(initial || "?", cx, cy + 13, { align: "center" });
  doc.setTextColor(theme.text);
}

export async function buildStoryPdfBuffer(draft) {
  const theme = getThemeById(draft.themeId);
  const isPremium = draft.tier === "premium";
  const doc = new jsPDF({ unit: "pt", format: "a5" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  // ---- Cover page: portrait, title, "Starring X" ----
  fillBackground(doc, theme, pageWidth, pageHeight);
  drawAccentBars(doc, theme, pageWidth, pageHeight);

  const character = isPremium ? null : getCharacterById(draft.characterId);
  const portraitR = 60;
  const portraitCy = 110;
  const displayName = isPremium ? draft.childName : character?.name;

  // Both tiers store the cover portrait as a URL now (Basic always did;
  // Premium switched to match — see README on the sessionStorage quota fix
  // in generate-illustrations.js) — no more tier branching needed here.
  const portraitBase64 = draft.characterImageUrl ? await fetchImageAsBase64(draft.characterImageUrl) : null;

  let drewPortrait = false;
  if (portraitBase64) {
    drewPortrait = drawCircularImage(doc, portraitBase64, pageWidth / 2, portraitCy, portraitR);
  }
  if (!drewPortrait) {
    drawFallbackPortrait(doc, theme, pageWidth / 2, portraitCy, portraitR, displayName?.[0]);
  }

  // Title wrapping is measured, not assumed — this is what fixes the
  // subtitle-overlapping-a-wrapped-title bug: the cursor only advances to
  // where the title actually finished, whether that's one line or three.
  let cursorY = portraitCy + portraitR + 40;
  doc.setFont("times", "bold");
  doc.setFontSize(24);
  const titleLines = doc.splitTextToSize(draft.title, pageWidth - MARGIN * 2);
  titleLines.forEach((line) => {
    doc.text(line, pageWidth / 2, cursorY, { align: "center" });
    cursorY += 28;
  });

  cursorY += 8;
  doc.setFont("times", "normal");
  doc.setFontSize(12);
  doc.text(`Starring ${displayName || ""}`, pageWidth / 2, cursorY, { align: "center" });

  drawPageFooter(doc, pageWidth, pageHeight, "StoryNest", theme);

  // ---- Story pages ----
  // Both tiers now produce the same page shape ({ text, image }), where
  // `image` is a URL into the private `story-pages` Storage bucket, not
  // embedded base64 — see generate-illustrations.js for why (a real
  // sessionStorage quota bug). Fetched and converted to base64 here, right
  // before embedding, same as the cover portrait above.
  for (let i = 0; i < draft.pages.length; i++) {
    const page = draft.pages[i];
    doc.addPage();
    fillBackground(doc, theme, pageWidth, pageHeight);
    drawAccentBars(doc, theme, pageWidth, pageHeight);
    let y = MARGIN + ACCENT_BAR_HEIGHT + 10;
    const pageImageBase64 = page.image ? await fetchImageAsBase64(page.image) : null;
    if (pageImageBase64) {
      const imgSize = pageWidth - MARGIN * 2;
      doc.addImage(`data:image/png;base64,${pageImageBase64}`, "PNG", MARGIN, y, imgSize, imgSize);
      y += imgSize + 24;
    }
    const isLast = i === draft.pages.length - 1;
    doc.setFontSize(13);
    doc.setFont("times", isLast ? "bolditalic" : "normal");
    const lines = doc.splitTextToSize(page.text, pageWidth - MARGIN * 2);
    doc.text(lines, MARGIN, y);
    drawPageFooter(doc, pageWidth, pageHeight, `Page ${i + 1} of ${draft.pages.length}`, theme);
  }

  return new Uint8Array(doc.output("arraybuffer"));
}

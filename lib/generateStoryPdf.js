// Builds the storybook-style PDF used for both the client-side "Download
// PDF" button (success.js) and the server-side email attachment
// (verify-payment.js, redeem-subscription-story.js) — one function, so the
// two can't drift apart.
//
// Design: every page is a full-bleed illustration (image scaled to cover
// the entire page, cropped via a clip path — not boxed with margins) with
// a semi-transparent "caption card" anchored to the bottom holding the
// text, rather than a plain background with a small image and text below
// it. Cover and back-cover pages are new: a full-page title treatment with
// the parent's name as author and a "StoryNest" imprint, and a closing
// page with a promotional blurb, matching how a real printed picture book
// is bound.
//
// Honest limitation: text uses jsPDF's built-in Times font (bold/italic
// variants), not a custom playful/rounded typeface — embedding a real
// display font (matching the site's own Fraunces/Nunito Sans) is possible
// with jsPDF but requires bundling an actual font file and converting it
// via jsPDF's font tool, which isn't done here. "Playful" is achieved
// through layout, color, and scale instead of typeface.
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

const MARGIN = 36;

function fillSolid(doc, color, pageWidth, pageHeight) {
  doc.setFillColor(color);
  doc.rect(0, 0, pageWidth, pageHeight, "F");
}

// Full-bleed "cover fit" image: scales a source image up so it fully
// covers the page regardless of orientation, cropping the overflow via a
// clip path — the same clip technique proven for the old circular
// portrait, generalized to the full page rectangle. Falls back to a solid
// accent-colored page with a big centered initial if no image is
// available or the clip API misbehaves, rather than producing a broken
// page.
//
// sourceWidth/sourceHeight default to the square 1024x1024 that story-page
// SCENE illustrations (generate-illustrations.js) always use — but the
// cover/back-cover character portrait is now generated at 1024x1536
// (portrait, not square — see generate-character-image.js for why), so
// those two call sites pass the real dimensions explicitly. Getting this
// wrong would silently distort or mis-crop the image, since the cover-fit
// math depends on knowing the source's actual aspect ratio.
function drawFullBleedImage(doc, theme, base64, pageWidth, pageHeight, fallbackInitial, sourceWidth = 1024, sourceHeight = 1024) {
  if (!base64) {
    fillSolid(doc, theme.accent, pageWidth, pageHeight);
    if (fallbackInitial) {
      doc.setTextColor(theme.bg);
      doc.setFont("times", "bold");
      doc.setFontSize(Math.min(pageWidth, pageHeight) * 0.35);
      doc.text(fallbackInitial, pageWidth / 2, pageHeight / 2 + 20, { align: "center" });
      doc.setTextColor(theme.text);
    }
    return false;
  }
  try {
    doc.saveGraphicsState();
    doc.rect(0, 0, pageWidth, pageHeight);
    doc.clip();
    doc.discardPath();
    const scale = Math.max(pageWidth / sourceWidth, pageHeight / sourceHeight);
    const drawWidth = sourceWidth * scale;
    const drawHeight = sourceHeight * scale;
    const offsetX = (pageWidth - drawWidth) / 2;
    const offsetY = (pageHeight - drawHeight) / 2;
    doc.addImage(`data:image/png;base64,${base64}`, "PNG", offsetX, offsetY, drawWidth, drawHeight);
    doc.restoreGraphicsState();
    return true;
  } catch {
    fillSolid(doc, theme.accent, pageWidth, pageHeight);
    return false;
  }
}

// The semi-transparent "caption card" that makes text readable sitting on
// top of a full-bleed illustration. Height grows with how many lines it
// needs to hold, capped so it never swallows more than ~55% of the page.
// Returns where it was drawn so the caller knows where to place text.
function drawTextBand(doc, theme, pageWidth, pageHeight, { lineCount, lineHeight = 16, paddingTop = 20, paddingBottom = 16 }) {
  const maxBandHeight = pageHeight * 0.55;
  const contentHeight = paddingTop + lineCount * lineHeight + paddingBottom;
  const bandHeight = Math.min(contentHeight, maxBandHeight);
  const bandY = pageHeight - bandHeight;

  try {
    doc.setGState(new doc.GState({ opacity: 0.88 }));
  } catch {
    /* older jsPDF without GState — band just renders fully opaque, still readable */
  }
  doc.setFillColor(theme.bg);
  try {
    doc.roundedRect(0, bandY, pageWidth, bandHeight + 4, 18, 18, "F");
  } catch {
    doc.rect(0, bandY, pageWidth, bandHeight, "F");
  }
  try {
    doc.setGState(new doc.GState({ opacity: 1 }));
  } catch {
    /* no-op if unsupported */
  }

  // A thin accent-colored rule along the band's top edge — the one
  // remaining trace of the site's ".cloth-trim" motif now that full-bleed
  // images replaced the old solid top/bottom bars.
  doc.setFillColor(theme.accent);
  doc.rect(0, bandY, pageWidth, 4, "F");

  doc.setTextColor(theme.text);
  return { bandY, bandHeight };
}

export async function buildStoryPdfBuffer(draft) {
  const theme = getThemeById(draft.themeId);
  const isPremium = draft.tier === "premium";
  const orientation = draft.orientation === "landscape" ? "landscape" : "portrait";
  const doc = new jsPDF({ unit: "pt", format: "a5", orientation });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  const character = isPremium ? null : getCharacterById(draft.characterId);
  const displayName = isPremium ? draft.childName : character?.name;
  const authorName = draft.authorName?.trim();

  // ---- FRONT COVER: full-bleed character art, title, author, imprint ----
  const coverBase64 = draft.characterImageUrl ? await fetchImageAsBase64(draft.characterImageUrl) : null;
  drawFullBleedImage(doc, theme, coverBase64, pageWidth, pageHeight, displayName?.[0], 1024, 1536);

  doc.setFont("times", "bold");
  doc.setFontSize(26);
  const titleLines = doc.splitTextToSize(draft.title, pageWidth - MARGIN * 2);
  // Verbatim, not "Written by {name}" — the parent controls the exact
  // wording (e.g. "Written by Mummy", "By the Adeniji Family", "For Tolu,
  // from Grandma"), not just the name slotted into a fixed phrase.
  const bylineText = authorName || null;

  const { bandY: coverBandY } = drawTextBand(doc, theme, pageWidth, pageHeight, {
    lineCount: titleLines.length + (bylineText ? 1 : 0) + 0.6,
    lineHeight: 30,
    paddingTop: 26,
    paddingBottom: 22,
  });

  let ty = coverBandY + 38;
  doc.setFont("times", "bold");
  doc.setFontSize(26);
  titleLines.forEach((line) => {
    doc.text(line, pageWidth / 2, ty, { align: "center" });
    ty += 30;
  });
  if (bylineText) {
    ty += 6;
    doc.setFont("times", "italic");
    doc.setFontSize(13);
    doc.text(bylineText, pageWidth / 2, ty, { align: "center" });
  }

  // Publisher imprint, like a colophon — always visible so a StoryNest
  // book reads as unmistakably a StoryNest book.
  doc.setFont("times", "bold");
  doc.setFontSize(11);
  doc.setTextColor(theme.accent);
  doc.text("A STORYNEST BOOK", pageWidth / 2, pageHeight - 14, { align: "center" });
  doc.setTextColor(theme.text);

  // ---- STORY PAGES: full-bleed illustration + caption card ----
  for (let i = 0; i < draft.pages.length; i++) {
    const page = draft.pages[i];
    doc.addPage();
    const pageImageBase64 = page.image ? await fetchImageAsBase64(page.image) : null;
    drawFullBleedImage(doc, theme, pageImageBase64, pageWidth, pageHeight, displayName?.[0]);

    const isLast = i === draft.pages.length - 1;
    doc.setFont("times", isLast ? "bolditalic" : "normal");
    const bodyFontSize = 17; // was 14 — too small for a children's book meant to be read aloud or printed
    const bodyLineHeight = 22;
    doc.setFontSize(bodyFontSize);
    const lines = doc.splitTextToSize(page.text, pageWidth - MARGIN * 2);

    const { bandY } = drawTextBand(doc, theme, pageWidth, pageHeight, {
      lineCount: lines.length,
      lineHeight: bodyLineHeight,
      paddingTop: 22,
      paddingBottom: 16,
    });

    let y = bandY + 34;
    lines.forEach((line) => {
      doc.text(line, pageWidth / 2, y, { align: "center" });
      y += bodyLineHeight;
    });

    doc.setFont("times", "normal");
    doc.setFontSize(9);
    doc.setTextColor(theme.accent);
    doc.text(`${i + 1} / ${draft.pages.length}`, pageWidth - 18, pageHeight - 10, { align: "right" });
    doc.setTextColor(theme.text);
  }

  // ---- BACK COVER: character waving + StoryNest promo blurb ----
  doc.addPage();
  const backCoverBase64 = draft.backCoverImageUrl
    ? await fetchImageAsBase64(draft.backCoverImageUrl)
    : coverBase64;
  drawFullBleedImage(doc, theme, backCoverBase64, pageWidth, pageHeight, displayName?.[0], 1024, 1536);

  const blurb = `${displayName || "Your child"} can't wait for the next adventure! StoryNest creates personalized, illustrated storybooks starring your own child — pick a character or upload their photo, and a brand-new book is ready in minutes.`;
  const blurbFontSize = 13; // was 11 — consistent with the story-page body text size bump
  const blurbLineHeight = 18;
  doc.setFont("times", "normal");
  doc.setFontSize(blurbFontSize);
  const blurbLines = doc.splitTextToSize(blurb, pageWidth - MARGIN * 2);

  const { bandY: backBandY } = drawTextBand(doc, theme, pageWidth, pageHeight, {
    lineCount: blurbLines.length + 1.5,
    lineHeight: blurbLineHeight,
    paddingTop: 24,
    paddingBottom: 20,
  });

  let by = backBandY + 36;
  doc.setFont("times", "bold");
  doc.setFontSize(15);
  doc.text("More stories await at StoryNest", pageWidth / 2, by, { align: "center" });
  by += 24;
  doc.setFont("times", "normal");
  doc.setFontSize(blurbFontSize);
  blurbLines.forEach((line) => {
    doc.text(line, pageWidth / 2, by, { align: "center" });
    by += blurbLineHeight;
  });

  return new Uint8Array(doc.output("arraybuffer"));
}

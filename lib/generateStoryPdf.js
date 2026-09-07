// Builds the same PDF layout as pages/success.js's client-side download,
// but server-side, returning bytes instead of triggering a browser save.
// This is what makes email delivery and "redownload later" possible — the
// client-side jsPDF button in success.js is now a convenience, not the
// only copy that ever exists.

import { jsPDF } from "jspdf";
import { getCharacterById } from "@/data/characters";
import { getThemeById } from "@/data/colorThemes";

export function buildStoryPdfBuffer(draft) {
  const theme = getThemeById(draft.themeId);
  const isPremium = draft.tier === "premium";
  const doc = new jsPDF({ unit: "pt", format: "a5" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 48;

  function fillBackground() {
    doc.setFillColor(theme.bg);
    doc.rect(0, 0, pageWidth, pageHeight, "F");
    doc.setTextColor(theme.text);
  }

  fillBackground();
  doc.setFont("times", "bold");
  doc.setFontSize(24);
  doc.text(draft.title, pageWidth / 2, 100, { align: "center", maxWidth: pageWidth - margin * 2 });
  doc.setFontSize(12);
  doc.setFont("times", "normal");
  const subtitle = isPremium
    ? `Starring ${draft.childName}`
    : `Starring ${getCharacterById(draft.characterId)?.name || ""}`;
  doc.text(subtitle, pageWidth / 2, 130, { align: "center" });

  if (isPremium) {
    draft.pages.forEach((page) => {
      doc.addPage();
      fillBackground();
      let y = margin;
      if (page.image) {
        const imgSize = pageWidth - margin * 2;
        doc.addImage(`data:image/png;base64,${page.image}`, "PNG", margin, y, imgSize, imgSize);
        y += imgSize + 24;
      }
      doc.setFontSize(13);
      const lines = doc.splitTextToSize(page.text, pageWidth - margin * 2);
      doc.text(lines, margin, y);
    });
  } else {
    const paragraphs = draft.story.split(/\n+/).filter(Boolean);
    let y = 180;
    doc.setFontSize(12);
    paragraphs.forEach((p) => {
      const lines = doc.splitTextToSize(p, pageWidth - margin * 2);
      if (y + lines.length * 16 > pageHeight - margin) {
        doc.addPage();
        fillBackground();
        y = margin;
      }
      doc.text(lines, margin, y);
      y += lines.length * 16 + 12;
    });
  }

  // 'arraybuffer' works in both the browser and Node — unlike doc.save(),
  // which is a browser-only convenience that triggers a download and does
  // not exist in a Node/serverless context.
  return Buffer.from(doc.output("arraybuffer"));
}

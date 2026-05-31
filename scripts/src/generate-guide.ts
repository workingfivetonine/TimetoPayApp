/**
 * Regenerates the offline Receipt Tracker guide from the single source of truth
 * (`@workspace/guide-content`) so it never drifts from the in-app Help screen.
 *
 * Outputs:
 *   - docs/guide/Receipt-Tracker-Guide.md
 *   - docs/guide/Receipt-Tracker-Guide.pdf
 *   - docs/guide/images/*.jpg                  (copied from the app's assets)
 *   - artifacts/receipt-tracker/assets/guide/Receipt-Tracker-Guide.pdf  (bundled copy)
 *
 * Run with: pnpm --filter @workspace/scripts run generate-guide
 */
import { createWriteStream, mkdirSync, copyFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import PDFDocument from "pdfkit";
import {
  GUIDE_SECTIONS,
  GUIDE_ADMIN_SECTIONS,
  GUIDE_TITLE,
  GUIDE_TAGLINE,
  GUIDE_ADMIN_HEADING,
  GUIDE_ADMIN_NOTE,
  GUIDE_FOOTER,
  type GuideSectionContent,
} from "@workspace/guide-content";

const REPO_ROOT = resolve(fileURLToPath(import.meta.url), "../../..");

const APP_IMAGES_DIR = join(REPO_ROOT, "artifacts/receipt-tracker/assets/images/guide");
const DOCS_DIR = join(REPO_ROOT, "docs/guide");
const DOCS_IMAGES_DIR = join(DOCS_DIR, "images");
const BUNDLED_GUIDE_DIR = join(REPO_ROOT, "artifacts/receipt-tracker/assets/guide");

const MD_PATH = join(DOCS_DIR, "Receipt-Tracker-Guide.md");
const PDF_PATH = join(DOCS_DIR, "Receipt-Tracker-Guide.pdf");
const BUNDLED_PDF_PATH = join(BUNDLED_GUIDE_DIR, "Receipt-Tracker-Guide.pdf");

const IMG_WIDTH_MD = 280;

// Theme tokens (kept in step with constants/colors.ts teal theme).
const COLOR_PRIMARY = "#0f766e";
const COLOR_FOREGROUND = "#1f2937";
const COLOR_MUTED = "#6b7280";
const COLOR_ACCENT = "#ccfbf1";

function ensureDirs(): void {
  for (const dir of [DOCS_DIR, DOCS_IMAGES_DIR, BUNDLED_GUIDE_DIR]) {
    mkdirSync(dir, { recursive: true });
  }
}

function copyImages(sections: GuideSectionContent[]): void {
  for (const section of sections) {
    const src = join(APP_IMAGES_DIR, section.imageFile);
    if (!existsSync(src)) {
      throw new Error(
        `Missing screenshot "${section.imageFile}" in ${APP_IMAGES_DIR}. ` +
          `Add it before regenerating the guide.`,
      );
    }
    copyFileSync(src, join(DOCS_IMAGES_DIR, section.imageFile));
  }
}

function buildMarkdown(): string {
  const lines: string[] = [];
  lines.push(`# ${GUIDE_TITLE}`, "");
  lines.push(`> ${GUIDE_TAGLINE}`, "");
  lines.push("---", "");

  let n = 0;
  const renderSection = (section: GuideSectionContent) => {
    n += 1;
    lines.push(`## ${n}. ${section.title}`, "");
    lines.push(section.intro, "");
    lines.push(
      `<img src="images/${section.imageFile}" width="${IMG_WIDTH_MD}" alt="${section.title}" />`,
      "",
    );
    for (const step of section.steps) {
      lines.push(`- ${step}`);
    }
    lines.push("");
  };

  for (const section of GUIDE_SECTIONS) renderSection(section);

  lines.push("---", "");
  lines.push(`## 🔒 ${GUIDE_ADMIN_HEADING}`, "");
  lines.push(GUIDE_ADMIN_NOTE, "");

  for (const section of GUIDE_ADMIN_SECTIONS) renderSection(section);

  lines.push("---", "");
  lines.push(`_${GUIDE_FOOTER}_`, "");

  return lines.join("\n");
}

function buildPdf(): Promise<void> {
  return new Promise((resolvePdf, rejectPdf) => {
    const doc = new PDFDocument({ size: "A4", margin: 54, autoFirstPage: true });
    const stream = createWriteStream(PDF_PATH);
    stream.on("finish", () => resolvePdf());
    stream.on("error", rejectPdf);
    doc.on("error", rejectPdf);
    doc.pipe(stream);

    const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;

    // Cover / intro
    doc.fillColor(COLOR_PRIMARY).font("Helvetica-Bold").fontSize(26).text(GUIDE_TITLE);
    doc.moveDown(0.6);
    doc.fillColor(COLOR_MUTED).font("Helvetica").fontSize(12).text(GUIDE_TAGLINE, {
      width: pageWidth,
      lineGap: 3,
    });
    doc.moveDown(1);
    doc
      .strokeColor(COLOR_ACCENT)
      .lineWidth(2)
      .moveTo(doc.page.margins.left, doc.y)
      .lineTo(doc.page.width - doc.page.margins.right, doc.y)
      .stroke();
    doc.moveDown(1);

    let n = 0;
    const renderSection = (section: GuideSectionContent) => {
      n += 1;
      // Keep a section header with its intro on the same page when near the bottom.
      if (doc.y > doc.page.height - doc.page.margins.bottom - 160) {
        doc.addPage();
      }

      doc
        .fillColor(COLOR_PRIMARY)
        .font("Helvetica-Bold")
        .fontSize(16)
        .text(`${n}. ${section.title}`);
      doc.moveDown(0.4);
      doc
        .fillColor(COLOR_FOREGROUND)
        .font("Helvetica")
        .fontSize(11)
        .text(section.intro, { width: pageWidth, lineGap: 2 });
      doc.moveDown(0.5);

      // Screenshot
      const imgPath = join(APP_IMAGES_DIR, section.imageFile);
      try {
        doc.image(imgPath, { fit: [200, 360], align: "center" });
      } catch {
        // If an image can't be embedded, skip it rather than failing the whole build.
      }
      doc.moveDown(0.6);

      // Steps
      for (const step of section.steps) {
        const startY = doc.y;
        doc.fillColor(COLOR_PRIMARY).font("Helvetica-Bold").fontSize(11).text("•", doc.page.margins.left, startY, {
          continued: false,
          width: 14,
        });
        doc
          .fillColor(COLOR_FOREGROUND)
          .font("Helvetica")
          .fontSize(11)
          .text(step, doc.page.margins.left + 16, startY, {
            width: pageWidth - 16,
            lineGap: 2,
          });
        doc.moveDown(0.3);
      }
      doc.moveDown(0.8);
    };

    for (const section of GUIDE_SECTIONS) renderSection(section);

    // Admin divider
    doc.addPage();
    doc
      .fillColor(COLOR_PRIMARY)
      .font("Helvetica-Bold")
      .fontSize(20)
      .text(`🔒 ${GUIDE_ADMIN_HEADING}`);
    doc.moveDown(0.4);
    doc
      .fillColor(COLOR_MUTED)
      .font("Helvetica")
      .fontSize(11)
      .text(GUIDE_ADMIN_NOTE, { width: pageWidth });
    doc.moveDown(1);

    for (const section of GUIDE_ADMIN_SECTIONS) renderSection(section);

    doc.moveDown(1.5);
    doc
      .fillColor(COLOR_MUTED)
      .font("Helvetica-Oblique")
      .fontSize(9)
      .text(GUIDE_FOOTER, { width: pageWidth });

    doc.end();
  });
}

async function main(): Promise<void> {
  ensureDirs();
  copyImages([...GUIDE_SECTIONS, ...GUIDE_ADMIN_SECTIONS]);

  writeFileSync(MD_PATH, buildMarkdown(), "utf8");
  console.log(`Wrote ${MD_PATH}`);

  await buildPdf();
  console.log(`Wrote ${PDF_PATH}`);

  copyFileSync(PDF_PATH, BUNDLED_PDF_PATH);
  console.log(`Copied PDF to ${BUNDLED_PDF_PATH}`);
}

main().catch((err) => {
  console.error("Failed to generate guide:", err);
  process.exit(1);
});

/**
 * Regenerates the offline TimetoPay guide from the single source of truth
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
import {
  createWriteStream,
  mkdirSync,
  copyFileSync,
  writeFileSync,
  readFileSync,
  existsSync,
  mkdtempSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import PDFDocument from "pdfkit";
import {
  GUIDE_SECTIONS,
  GUIDE_TITLE,
  GUIDE_TAGLINE,
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
  lines.push(`_${GUIDE_FOOTER}_`, "");

  return lines.join("\n");
}

// Fixed metadata date so regenerating the PDF from unchanged content yields
// byte-identical output (pdfkit defaults CreationDate to "now", which would
// otherwise make the --check drift comparison fail spuriously).
const FIXED_PDF_DATE = new Date(Date.UTC(2024, 0, 1, 0, 0, 0));

function buildPdf(outPath: string): Promise<void> {
  return new Promise((resolvePdf, rejectPdf) => {
    const doc = new PDFDocument({
      size: "A4",
      margin: 54,
      autoFirstPage: true,
      info: { CreationDate: FIXED_PDF_DATE },
    });
    const stream = createWriteStream(outPath);
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

    doc.moveDown(1.5);
    doc
      .fillColor(COLOR_MUTED)
      .font("Helvetica-Oblique")
      .fontSize(9)
      .text(GUIDE_FOOTER, { width: pageWidth });

    doc.end();
  });
}

async function write(): Promise<void> {
  ensureDirs();
  copyImages(GUIDE_SECTIONS);

  writeFileSync(MD_PATH, buildMarkdown(), "utf8");
  console.log(`Wrote ${MD_PATH}`);

  await buildPdf(PDF_PATH);
  console.log(`Wrote ${PDF_PATH}`);

  copyFileSync(PDF_PATH, BUNDLED_PDF_PATH);
  console.log(`Copied PDF to ${BUNDLED_PDF_PATH}`);
}

/**
 * Regenerate the guide into a temp location and compare it against the committed
 * outputs. Fails (exit 1) if any of them drifted, so CI/validation catches a
 * stale offline guide before merge.
 */
async function check(): Promise<void> {
  // Screenshots referenced by the content must still exist.
  copyImages(GUIDE_SECTIONS);

  const tmpDir = mkdtempSync(join(tmpdir(), "guide-check-"));
  const tmpPdf = join(tmpDir, "Receipt-Tracker-Guide.pdf");
  await buildPdf(tmpPdf);
  const freshPdf = readFileSync(tmpPdf);
  const freshMd = buildMarkdown();

  const drifted: string[] = [];

  const compareText = (label: string, path: string, fresh: string) => {
    if (!existsSync(path)) {
      drifted.push(`${label} is missing: ${path}`);
      return;
    }
    if (readFileSync(path, "utf8") !== fresh) {
      drifted.push(`${label} is out of date: ${path}`);
    }
  };

  const comparePdf = (label: string, path: string, fresh: Buffer) => {
    if (!existsSync(path)) {
      drifted.push(`${label} is missing: ${path}`);
      return;
    }
    if (!readFileSync(path).equals(fresh)) {
      drifted.push(`${label} is out of date: ${path}`);
    }
  };

  compareText("Guide Markdown", MD_PATH, freshMd);
  comparePdf("Guide PDF", PDF_PATH, freshPdf);
  comparePdf("Bundled guide PDF", BUNDLED_PDF_PATH, freshPdf);

  rmSync(tmpDir, { recursive: true, force: true });

  if (drifted.length > 0) {
    console.error("Offline guide is out of date:");
    for (const msg of drifted) console.error(`  - ${msg}`);
    console.error(
      "\nRun `pnpm --filter @workspace/scripts run generate-guide` and commit the result.",
    );
    process.exit(1);
  }

  console.log("Offline guide is up to date.");
}

const isCheck = process.argv.includes("--check");

(isCheck ? check() : write()).catch((err) => {
  console.error(`Failed to ${isCheck ? "check" : "generate"} guide:`, err);
  process.exit(1);
});

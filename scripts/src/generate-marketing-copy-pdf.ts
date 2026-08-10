/**
 * Renders docs/brand-kit/Receipt-Tracker-Marketing-Copy.md to a matching PDF.
 *
 * This is a small, purpose-built Markdown subset renderer (h1/h2/h3, bold,
 * bullets, blockquotes, horizontal rules, plain paragraphs) — not a general
 * Markdown-to-PDF tool. It exists because there's no markdown parser already
 * in the workspace and pandoc isn't installed; adding either for one
 * copy-paste reference doc would be more machinery than the doc is worth.
 *
 * Every text draw here uses either pure flowing `.text()` (no explicit x/y)
 * or the two-call "short non-wrapping prefix + wrapping remainder at the same
 * startY" pattern from generate-guide.ts's step renderer and
 * generate-brand-kit.ts's bullet list. Deliberately NOT using
 * `.text(str, x, y, {continued: true})` followed by a long wrapped
 * continuation — that combination made pdfkit insert 1-2 phantom blank pages
 * per bullet in generate-brand-kit.ts (see that file's history). Two separate
 * absolute-positioned calls at one shared y does not have that problem.
 *
 * Run: pnpm --filter @workspace/scripts run generate-marketing-copy
 */
import PDFDocument from "pdfkit";
import { createWriteStream, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../..");

const SRC_PATH = path.join(REPO_ROOT, "docs/brand-kit/Receipt-Tracker-Marketing-Copy.md");
const OUT_PATH = path.join(REPO_ROOT, "docs/brand-kit/Receipt-Tracker-Marketing-Copy.pdf");

const PAGE_MARGIN = 54;
const PRIMARY = "#04576A";
const INK = "#17242B";
const MUTED = "#5f6b74";
const BORDER = "#e0dee8";

/** Strip `**bold**` markers, returning plain text (used where we don't render inline bold). */
function stripBold(s: string): string {
  return s.replace(/\*\*(.+?)\*\*/g, "$1").replace(/\*(.+?)\*/g, "$1");
}

/** Splits "**Bold prefix** rest of line" into [boldPrefix, rest] if the line starts with bold. */
function splitLeadingBold(line: string): [string, string] | null {
  const m = line.match(/^(\*\*.+?\*\*[^\w]*)(.*)$/);
  if (!m) return null;
  return [stripBold(m[1]), m[2]];
}

function main() {
  const md = readFileSync(SRC_PATH, "utf8");
  const lines = md.split(/\r?\n/);

  const doc = new PDFDocument({
    size: "A4",
    margin: PAGE_MARGIN,
    info: { CreationDate: new Date(Date.UTC(2024, 0, 1)), Title: "TimetoPay Marketing Copy", Author: "FivetoNine" },
  });
  const stream = createWriteStream(OUT_PATH);
  doc.pipe(stream);
  const pageWidth = doc.page.width - PAGE_MARGIN * 2;

  let i = 0;
  while (i < lines.length) {
    const raw = lines[i];
    const line = raw.trim();

    if (line === "") {
      doc.moveDown(0.4);
      i++;
      continue;
    }

    if (line === "---") {
      doc.moveDown(0.3);
      doc
        .strokeColor(BORDER)
        .lineWidth(1)
        .moveTo(PAGE_MARGIN, doc.y)
        .lineTo(doc.page.width - PAGE_MARGIN, doc.y)
        .stroke();
      doc.moveDown(0.6);
      i++;
      continue;
    }

    const h1 = line.match(/^#\s+(.*)/);
    const h2 = line.match(/^##\s+(.*)/);
    const h3 = line.match(/^###\s+(.*)/);
    if (h1) {
      doc.moveDown(0.3);
      doc.fillColor(PRIMARY).font("Helvetica-Bold").fontSize(20).text(stripBold(h1[1]), { width: pageWidth });
      doc.moveDown(0.4);
      i++;
      continue;
    }
    if (h2) {
      doc.moveDown(0.8);
      doc.fillColor(PRIMARY).font("Helvetica-Bold").fontSize(15).text(stripBold(h2[1]), { width: pageWidth });
      doc.moveDown(0.3);
      i++;
      continue;
    }
    if (h3) {
      doc.moveDown(0.5);
      doc.fillColor(INK).font("Helvetica-Bold").fontSize(12).text(stripBold(h3[1]), { width: pageWidth });
      doc.moveDown(0.25);
      i++;
      continue;
    }

    const quote = line.match(/^>\s?(.*)/);
    if (quote) {
      // Collect consecutive blockquote lines into one paragraph.
      const parts = [quote[1]];
      while (i + 1 < lines.length && /^>\s?/.test(lines[i + 1].trim())) {
        i++;
        parts.push(lines[i].trim().replace(/^>\s?/, ""));
      }
      const text = stripBold(parts.join(" ").trim());
      const barX = PAGE_MARGIN;
      const startY = doc.y;
      doc.fillColor(MUTED).font("Helvetica-Oblique").fontSize(10.5).text(text, barX + 14, startY, {
        width: pageWidth - 14,
        lineGap: 2,
      });
      const endY = doc.y;
      doc.rect(barX, startY, 3, endY - startY).fill(BORDER);
      doc.moveDown(0.5);
      i++;
      continue;
    }

    const bullet = line.match(/^[-*]\s+(.*)/);
    if (bullet) {
      const content = bullet[1];
      const startY = doc.y;
      doc.fillColor(PRIMARY).font("Helvetica-Bold").fontSize(10.5).text("•", PAGE_MARGIN, startY, { width: 12 });

      const split = splitLeadingBold(content);
      if (split) {
        const [boldPart, rest] = split;
        doc.fillColor(INK).font("Helvetica-Bold").fontSize(10.5).text(boldPart, PAGE_MARGIN + 14, startY, {
          width: pageWidth - 14,
          continued: false,
          lineBreak: false,
        });
        const boldWidth = doc.widthOfString(boldPart);
        doc
          .fillColor(MUTED)
          .font("Helvetica")
          .fontSize(10.5)
          .text(stripBold(rest), PAGE_MARGIN + 14 + boldWidth, startY, {
            width: pageWidth - 14 - boldWidth,
            lineGap: 2,
          });
      } else {
        doc
          .fillColor(INK)
          .font("Helvetica")
          .fontSize(10.5)
          .text(stripBold(content), PAGE_MARGIN + 14, startY, { width: pageWidth - 14, lineGap: 2 });
      }
      doc.moveDown(0.3);
      i++;
      continue;
    }

    // Plain paragraph — pure flowing text, no explicit position. May itself
    // contain a leading bold run ("**Field:** value"); handle the same way.
    const split = splitLeadingBold(line);
    if (split) {
      const [boldPart, rest] = split;
      const startY = doc.y;
      doc.fillColor(INK).font("Helvetica-Bold").fontSize(10.5).text(boldPart, PAGE_MARGIN, startY, {
        width: pageWidth,
        continued: false,
        lineBreak: false,
      });
      const boldWidth = doc.widthOfString(boldPart);
      doc
        .fillColor(INK)
        .font("Helvetica")
        .fontSize(10.5)
        .text(stripBold(rest), PAGE_MARGIN + boldWidth, startY, { width: pageWidth - boldWidth, lineGap: 2 });
    } else {
      doc.fillColor(INK).font("Helvetica").fontSize(10.5).text(stripBold(line), { width: pageWidth, lineGap: 2 });
    }
    doc.moveDown(0.3);
    i++;
  }

  doc.end();
  stream.on("finish", () => console.log(`Wrote ${OUT_PATH}`));
  stream.on("error", (err) => {
    console.error(err);
    process.exitCode = 1;
  });
}

main();

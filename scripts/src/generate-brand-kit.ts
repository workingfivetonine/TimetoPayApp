/**
 * Generates the TimetoPay 2.0 brand guidelines PDF — the teal palette, replacing
 * the violet one in docs/brand-kit/Receipt-Tracker-Brand-Kit.md (kept as a
 * historical record, not deleted, but no longer current).
 *
 * This is a reference document for manually setting up a Canva Brand Kit
 * (Brand Hub → Brand Kits → Colors / Logos / Fonts) — Canva has no API to
 * import a PDF directly into a Brand Kit, so this exists to be read alongside
 * the Canva UI while you type the hex codes in, not uploaded as a file Canva
 * parses on its own.
 *
 * Run: pnpm --filter @workspace/scripts run generate-brand-kit
 */
import PDFDocument from "pdfkit";
import { createWriteStream, existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../..");

const OUT_DIR = path.join(REPO_ROOT, "docs/brand-kit");
const OUT_PATH = path.join(OUT_DIR, "TimetoPay-Brand-Kit-2.0.pdf");
const ICON_PATH = path.join(REPO_ROOT, "artifacts/receipt-tracker/assets/images/icon.png");
const LOGO_PATH = path.join(REPO_ROOT, "artifacts/receipt-tracker/assets/images/logo-lockup.png");

// Pulled directly from artifacts/receipt-tracker/constants/colors.ts — the
// single source of truth the app itself reads from. Keep these in sync by
// hand; there are few enough that a codegen step would be more machinery
// than the four values are worth.
const PALETTE = {
  light: [
    { name: "Primary / Tint", hex: "#04576A", role: "Buttons, links, active states, the app icon" },
    { name: "Background", hex: "#F7F6F9", role: "Page background" },
    { name: "Card", hex: "#FFFFFF", role: "Cards, panels, surfaces" },
    { name: "Foreground / Text", hex: "#17242B", role: "Headings and body text" },
    { name: "Border", hex: "#E6E4EC", role: "Dividers, input borders" },
    { name: "Accent", hex: "#E3EDE9", role: "Tints, badge backgrounds (sage family)" },
    { name: "Savings / Good Price", hex: "#1E4D40", role: "Price drops, positive values" },
    { name: "Destructive / Price Spike", hex: "#C13E77", role: "Delete actions, price increases (magenta)" },
    { name: "Warning", hex: "#935A00", role: "Caution banners, unsaved-field highlights" },
  ],
  dark: [
    { name: "Primary / Tint", hex: "#4FB3C9", role: "Buttons, links, active states" },
    { name: "Background", hex: "#1C1B30", role: "Page background (navy-purple)" },
    { name: "Card", hex: "#272643", role: "Cards, panels, surfaces" },
    { name: "Foreground / Text", hex: "#EEF1F5", role: "Headings and body text" },
    { name: "Accent", hex: "#24463C", role: "Tints, badge backgrounds" },
    { name: "Savings / Good Price", hex: "#BBD4CE", role: "Price drops, positive values (sage)" },
    { name: "Destructive / Price Spike", hex: "#E8709E", role: "Delete actions, price increases" },
  ],
};

const CORE_SWATCHES = [
  { name: "Deep Teal", hex: "#04576A" },
  { name: "Navy-Purple", hex: "#272643" },
  { name: "Sage", hex: "#BBD4CE" },
  { name: "Magenta", hex: "#C13E77" },
];

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Perceived-luminance check so swatch labels stay legible on light or dark fills. */
function readableTextColor(hex: string): string {
  const [r, g, b] = hexToRgb(hex);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? "#17242B" : "#FFFFFF";
}

const PAGE_MARGIN = 54;

/**
 * Add a page break BEFORE drawing a block, if the block wouldn't fit on the
 * current page. Every absolute-positioned draw below (rect + text at a hand-
 * computed y) needs this called first — pdfkit's own auto-pagination only
 * looks at flowing `.text()` calls with no explicit position, and checking
 * fit only inside a loop body (rather than before it starts) let a stale y
 * from before a break get reused, so every remaining draw call in that loop
 * kept re-triggering its own page add. Call this once per block, not once
 * per draw call within it, and always re-read `doc.y` after calling this
 * rather than caching a `startY` from before it.
 */
function ensureSpace(doc: PDFKit.PDFDocument, neededHeight: number): void {
  const bottom = doc.page.height - doc.page.margins.bottom;
  if (doc.y + neededHeight > bottom) {
    doc.addPage();
  }
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  const doc = new PDFDocument({
    size: "A4",
    margin: PAGE_MARGIN,
    // Fixed date, matching the guide generator's convention: regenerating from
    // unchanged content should produce a byte-identical PDF.
    info: { CreationDate: new Date(Date.UTC(2024, 0, 1)), Title: "TimetoPay Brand Kit 2.0", Author: "FivetoNine" },
  });
  const stream = createWriteStream(OUT_PATH);
  doc.pipe(stream);
  const pageWidth = doc.page.width - PAGE_MARGIN * 2;
  const PRIMARY = "#04576A";
  const MUTED = "#5f6b74";
  const BORDER = "#e0dee8";

  // ── Cover ──────────────────────────────────────────────────────────────────
  if (existsSync(ICON_PATH)) {
    doc.image(ICON_PATH, PAGE_MARGIN, PAGE_MARGIN, { width: 64, height: 64 });
  }
  doc
    .fillColor(PRIMARY)
    .font("Helvetica-Bold")
    .fontSize(30)
    .text("TimetoPay", PAGE_MARGIN + 78, PAGE_MARGIN + 10);
  doc
    .fillColor(MUTED)
    .font("Helvetica")
    .fontSize(13)
    .text("Brand Guidelines — Version 2.0 (teal)", PAGE_MARGIN + 78, PAGE_MARGIN + 44);

  doc.moveDown(3.5);
  doc
    .fillColor("#17242B")
    .font("Helvetica")
    .fontSize(11.5)
    .text(
      "This replaces the earlier violet identity. Every value here is pulled directly from " +
        "artifacts/receipt-tracker/constants/colors.ts, the single source of truth the app itself " +
        "reads its theme from — so this document can never drift further from the shipping product " +
        "than that file does.",
      { width: pageWidth, lineGap: 3 },
    );
  doc.moveDown(1);
  doc
    .fillColor(MUTED)
    .fontSize(10)
    .text(
      "Use this alongside Canva's Brand Kit editor (Brand Hub → Brand Kits) — Canva has no import " +
        "for a PDF like this one; it's a reference to type the hex codes from, not a file Canva reads.",
      { width: pageWidth, lineGap: 3 },
    );

  // ── Core swatches, large ─────────────────────────────────────────────────
  doc.moveDown(2);
  const swatchW = (pageWidth - 3 * 12) / 4;
  const swatchH = 92;
  ensureSpace(doc, 20 + 24 + swatchH); // heading line + its gap + the swatch row
  sectionHeading(doc, "Core Palette", PRIMARY, pageWidth);

  const startY = doc.y;
  CORE_SWATCHES.forEach((s, i) => {
    const x = PAGE_MARGIN + i * (swatchW + 12);
    doc.rect(x, startY, swatchW, swatchH).fill(s.hex);
    const textColor = readableTextColor(s.hex);
    doc
      .fillColor(textColor)
      .font("Helvetica-Bold")
      .fontSize(11)
      .text(s.name, x + 10, startY + swatchH - 34, { width: swatchW - 20 });
    doc
      .fillColor(textColor)
      .font("Courier")
      .fontSize(10)
      .text(s.hex, x + 10, startY + swatchH - 18);
  });
  doc.y = startY + swatchH + 26;

  // ── Full light-mode table ────────────────────────────────────────────────
  sectionHeading(doc, "Light Mode Tokens", PRIMARY, pageWidth);
  drawTokenTable(doc, PALETTE.light, pageWidth, BORDER, MUTED);

  doc.addPage();

  // ── Full dark-mode table ─────────────────────────────────────────────────
  sectionHeading(doc, "Dark Mode Tokens", PRIMARY, pageWidth);
  doc
    .fillColor(MUTED)
    .font("Helvetica")
    .fontSize(10)
    .text(
      "The background is a navy-purple, not black — a deliberate choice to keep the dark theme " +
        "feeling like the same product as light mode rather than a generic OLED-black skin.",
      { width: pageWidth, lineGap: 3 },
    );
  doc.moveDown(0.8);
  drawTokenTable(doc, PALETTE.dark, pageWidth, BORDER, MUTED);

  // ── Typography ───────────────────────────────────────────────────────────
  doc.moveDown(2);
  sectionHeading(doc, "Typography", PRIMARY, pageWidth);
  doc
    .fillColor("#17242B")
    .font("Helvetica")
    .fontSize(11)
    .text(
      "The app typeface is Inter, loaded at four weights (Regular 400, Medium 500, SemiBold 600, " +
        "Bold 700). It is a standard Google Font and is in Canva's font library under that exact name " +
        "— no substitution needed.",
      { width: pageWidth, lineGap: 3 },
    );
  doc.moveDown(0.8);

  const typeRows: [string, string][] = [
    ["Screen titles / large numbers", "Inter Bold (700)"],
    ["Card titles, buttons, badges", "Inter SemiBold (600)"],
    ["Labels, secondary emphasis", "Inter Medium (500)"],
    ["Body text", "Inter Regular (400)"],
  ];
  const useColW = pageWidth * 0.62;
  for (const [use, weight] of typeRows) {
    // Two text() calls at the SAME explicit y, side by side, rather than
    // `continued: true` — see the note on the usage-bullets loop below for why.
    const rowY = doc.y;
    doc.fillColor("#17242B").font("Helvetica-Bold").fontSize(10.5).text(use, PAGE_MARGIN, rowY, { width: useColW });
    doc.font("Helvetica").fillColor(MUTED).text(weight, PAGE_MARGIN + useColW, rowY, { width: pageWidth - useColW });
    doc.moveDown(0.35);
  }

  // ── Logo ─────────────────────────────────────────────────────────────────
  doc.moveDown(1.5);
  sectionHeading(doc, "Logo", PRIMARY, pageWidth);
  doc
    .fillColor("#17242B")
    .font("Helvetica")
    .fontSize(10.5)
    .text(
      "Upload both to Canva's Brand Kit under Logos. The icon is the square app-icon mark; the " +
        "lockup pairs it with the wordmark for anywhere the name needs to be spelled out.",
      { width: pageWidth, lineGap: 3 },
    );
  doc.moveDown(0.6);
  ensureSpace(doc, 128);
  const logoY = doc.y;
  if (existsSync(ICON_PATH)) {
    doc.rect(PAGE_MARGIN, logoY, 100, 100).fillAndStroke("#F7F6F9", BORDER);
    doc.image(ICON_PATH, PAGE_MARGIN + 10, logoY + 10, { fit: [80, 80] });
    doc.fillColor(MUTED).font("Helvetica").fontSize(8.5).text("icon.png (1024×1024)", PAGE_MARGIN, logoY + 104, { width: 100, align: "center" });
  }
  if (existsSync(LOGO_PATH)) {
    doc.rect(PAGE_MARGIN + 120, logoY, 160, 100).fillAndStroke("#F7F6F9", BORDER);
    doc.image(LOGO_PATH, PAGE_MARGIN + 130, logoY + 10, { fit: [140, 80] });
    doc.fillColor(MUTED).font("Helvetica").fontSize(8.5).text("logo-lockup.png", PAGE_MARGIN + 120, logoY + 104, { width: 160, align: "center" });
  }
  doc.y = logoY + 128;

  // ── Usage notes ──────────────────────────────────────────────────────────
  doc.moveDown(1);
  sectionHeading(doc, "Using These Colors", PRIMARY, pageWidth);
  const usage = [
    "Deep Teal is the one color that should always read as \"TimetoPay\" — the app icon, primary buttons, links, and the tab-bar active state all use it.",
    "Sage and Magenta are semantic, not decorative: sage always means a good price or a savings figure, magenta always means a price increase or a destructive action. Don't swap them in for variety.",
    "Navy-Purple is dark-mode-only. It never appears as a light-mode color, and light mode never uses pure black or pure white as a surface — background is an off-white (#F7F6F9), matching the same restraint dark mode applies to its own near-black.",
    "Keep enough contrast between text and its background to stay legible — the app targets WCAG AA contrast on every token pair listed here.",
  ];
  for (const line of usage) {
    // Bullet + paragraph as two SEPARATE text() calls at the same starting y,
    // not one `continued: true` call. `continued` mode combined with an
    // explicit x/y lead-in and a long, multi-line wrapped continuation made
    // pdfkit badly miscalculate its own remaining page height near the bottom
    // margin — each bullet was inserting 1-2 phantom blank pages instead of
    // at most one real page break. This is the same two-call pattern
    // generate-guide.ts's step renderer already uses for exactly this reason.
    const startY = doc.y;
    doc.fillColor(PRIMARY).font("Helvetica-Bold").fontSize(10).text("•", PAGE_MARGIN, startY, { width: 14 });
    doc
      .fillColor("#17242B")
      .font("Helvetica")
      .fontSize(10)
      .text(line, PAGE_MARGIN + 16, startY, { width: pageWidth - 16, lineGap: 2 });
    doc.moveDown(0.5);
  }

  doc.moveDown(1.5);
  doc
    .fillColor(MUTED)
    .font("Helvetica")
    .fontSize(8.5)
    .text(
      "Generated from artifacts/receipt-tracker/constants/colors.ts. Regenerate with " +
        "`pnpm --filter @workspace/scripts run generate-brand-kit` any time the palette changes.",
      { width: pageWidth },
    );

  doc.end();
  await new Promise<void>((res, rej) => {
    stream.on("finish", () => res());
    stream.on("error", rej);
  });

  console.log(`Wrote ${OUT_PATH}`);
}

function sectionHeading(doc: PDFKit.PDFDocument, text: string, color: string, width: number) {
  doc.fillColor(color).font("Helvetica-Bold").fontSize(16).text(text, { width });
  doc.moveDown(0.5);
}

function drawTokenTable(
  doc: PDFKit.PDFDocument,
  rows: { name: string; hex: string; role: string }[],
  pageWidth: number,
  border: string,
  muted: string,
) {
  const swatchSize = 18;
  const nameW = 150;
  const hexW = 70;
  const roleW = pageWidth - swatchSize - 10 - nameW - hexW;

  for (const row of rows) {
    ensureSpace(doc, swatchSize + 8);
    const y = doc.y;
    doc.rect(PAGE_MARGIN, y, swatchSize, swatchSize).fillAndStroke(row.hex, border);
    doc
      .fillColor("#17242B")
      .font("Helvetica-Bold")
      .fontSize(9.5)
      .text(row.name, PAGE_MARGIN + swatchSize + 10, y + 4, { width: nameW });
    doc
      .fillColor(muted)
      .font("Courier")
      .fontSize(9)
      .text(row.hex, PAGE_MARGIN + swatchSize + 10 + nameW, y + 4, { width: hexW });
    doc
      .fillColor(muted)
      .font("Helvetica")
      .fontSize(9)
      .text(row.role, PAGE_MARGIN + swatchSize + 10 + nameW + hexW, y + 4, { width: roleW });
    doc.y = Math.max(doc.y, y + swatchSize) + 8;
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

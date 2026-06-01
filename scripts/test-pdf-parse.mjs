/**
 * Standalone test: run the parse-pdf logic against real PDFs.
 * Usage: node scripts/test-pdf-parse.mjs
 */
import { readFile, readdir, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const pdfParse = require("../artifacts/api-server/node_modules/pdf-parse/index.js");
const { default: OpenAI } = await import("../artifacts/api-server/node_modules/openai/index.js");
const execFileAsync = promisify(execFile);

const openai = new OpenAI({
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
});

const PDFS = [
  {
    label: "Rockaway Kosher (Gmail fwd → PDF, text-based)",
    path: "attached_assets/Gmail_-_Fwd__Order_#14870659_delivery__Friday,_September_12th,_1780291444256.pdf",
  },
  {
    label: "FILE (4-page image scan)",
    path: "attached_assets/FILE_20260601_012126_1780291444262.pdf",
  },
  {
    label: "Invoice (1-page image)",
    path: "attached_assets/Invoice_61413991295918083_1780291605188.pdf",
  },
];

const today = new Date().toISOString();
const jsonSchema = `{
  "storeName": "store or retailer name",
  "purchasedAt": "ISO 8601 date string (use today if unclear: ${today})",
  "total": total order amount as number,
  "lineItems": [
    { "name": "item name", "icon": "emoji", "category": "one of the fixed categories", "price": price per unit as number, "quantity": quantity as number }
  ]
}`;
const jsonInstructions = `Normalize item names (title case, remove special chars). If quantity is not shown, use 1. Only include actual purchased items — exclude delivery fees, taxes, discounts, and subtotals. For each item set "icon" to exactly one emoji. Set "category" to EXACTLY one of: "Produce", "Meat & Seafood", "Dairy & Eggs", "Bakery", "Pantry", "Frozen", "Beverages", "Snacks", "Household", "Personal Care", "Baby", "Pet", "Other".`;

for (const { label, path } of PDFS) {
  console.log(`\n${"=".repeat(70)}`);
  console.log(`PDF: ${label}`);
  console.log(`File: ${path}`);
  console.log("=".repeat(70));

  try {
    const buffer = await readFile(path);
    const pdfData = await pdfParse(buffer);
    const extractedText = pdfData.text.trim();
    console.log(`Pages: ${pdfData.numpages} | Text chars: ${extractedText.length} | Path: ${extractedText.length >= 50 ? "TEXT → gpt" : "IMAGE → vision"}`);

    let parsed;

    if (extractedText.length >= 50) {
      // Text path
      const response = await openai.chat.completions.create({
        model: "gpt-5.2",
        max_completion_tokens: 2048,
        messages: [{
          role: "user",
          content: `Extract receipt data from the following text (from an online order confirmation PDF) and return ONLY valid JSON (no markdown, no code blocks):\n${jsonSchema}\n${jsonInstructions}\n\nPDF text:\n${extractedText.slice(0, 8000)}`,
        }],
      });
      const content = response.choices[0]?.message?.content ?? "{}";
      try { parsed = JSON.parse(content); } catch { console.log("AI response (not JSON):", content.slice(0, 500)); continue; }
    } else {
      // Vision path — render with pdftoppm
      const id = randomUUID();
      const pdfPath = join(tmpdir(), `test-${id}.pdf`);
      const imgPrefix = join(tmpdir(), `test-${id}`);
      const tempFiles = [pdfPath];
      await writeFile(pdfPath, buffer);

      try {
        await execFileAsync("pdftoppm", ["-jpeg", "-r", "150", pdfPath, imgPrefix]);
      } catch (e) {
        console.log("pdftoppm error:", e.message);
        continue;
      }

      const allFiles = await readdir(tmpdir());
      const pageFiles = allFiles
        .filter(f => f.startsWith(`test-${id}`) && f.endsWith(".jpg"))
        .sort()
        .slice(0, 4);

      for (const f of pageFiles) tempFiles.push(join(tmpdir(), f));
      console.log(`Rendered ${pageFiles.length} page(s) as JPEG for vision`);

      if (pageFiles.length === 0) { console.log("No pages rendered"); continue; }

      const imageContents = await Promise.all(
        pageFiles.map(async f => {
          const imgBuf = await readFile(join(tmpdir(), f));
          return { type: "image_url", image_url: { url: `data:image/jpeg;base64,${imgBuf.toString("base64")}`, detail: "high" } };
        })
      );

      const response = await openai.chat.completions.create({
        model: "gpt-5.2",
        max_completion_tokens: 2048,
        messages: [{
          role: "user",
          content: [
            { type: "text", text: `These are pages from a receipt or order confirmation PDF. Extract the receipt data and return ONLY valid JSON (no markdown, no code blocks):\n${jsonSchema}\n${jsonInstructions}` },
            ...imageContents,
          ],
        }],
      });

      const content = response.choices[0]?.message?.content ?? "{}";
      try { parsed = JSON.parse(content); } catch { console.log("AI response (not JSON):", content.slice(0, 500)); }
      await Promise.all(tempFiles.map(f => unlink(f).catch(() => {})));
    }

    if (parsed) {
      console.log(`\nStore:     ${parsed.storeName}`);
      console.log(`Date:      ${parsed.purchasedAt}`);
      console.log(`Total:     $${parsed.total}`);
      console.log(`Items:     ${parsed.lineItems?.length ?? 0}`);
      console.log("\nLine items:");
      for (const item of (parsed.lineItems ?? []).slice(0, 40)) {
        console.log(`  ${item.icon ?? "?"} ${item.name.padEnd(40)} qty:${String(item.quantity).padStart(4)}  $${item.price}  [${item.category ?? "?"}]`);
      }
    }
  } catch (err) {
    console.log("ERROR:", err.message);
  }
}

console.log("\nDone.");

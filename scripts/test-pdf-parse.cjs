"use strict";
const pdfParse = require("/home/runner/workspace/node_modules/.pnpm/pdf-parse@2.4.5/node_modules/pdf-parse/index.js");
const OpenAI = require("/home/runner/workspace/node_modules/.pnpm/openai@6.39.1_ws@8.21.0_zod@3.25.76/node_modules/openai/index.js").default;
const fs = require("fs");
const fsp = require("fs/promises");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { execFile } = require("child_process");
const { promisify } = require("util");
const execFileAsync = promisify(execFile);

const openai = new OpenAI({
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
});

const PDFS = [
  { label: "Rockaway Kosher delivery (Gmail fwd, text-based)", path: "attached_assets/Gmail_-_Fwd__Order_#14870659_delivery__Friday,_September_12th,_1780291444256.pdf" },
  { label: "FILE (4-page image scan)", path: "attached_assets/FILE_20260601_012126_1780291444262.pdf" },
  { label: "Invoice (1-page image)", path: "attached_assets/Invoice_61413991295918083_1780291605188.pdf" },
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

async function run() {
  for (const { label, path: pdfPath } of PDFS) {
    console.log("\n" + "=".repeat(68));
    console.log("PDF:", label);
    console.log("=".repeat(68));
    const tempFiles = [];
    try {
      const buffer = fs.readFileSync(pdfPath);
      const pdfData = await pdfParse(buffer);
      const extractedText = pdfData.text.trim();
      const useVision = extractedText.length < 50;
      console.log(`Pages: ${pdfData.numpages} | Text chars: ${extractedText.length} | Mode: ${useVision ? "IMAGE → vision" : "TEXT → gpt"}`);

      let parsed;

      if (!useVision) {
        const resp = await openai.chat.completions.create({
          model: "gpt-5.2",
          max_completion_tokens: 2048,
          messages: [{ role: "user", content: `Extract receipt data from the following text (online order confirmation PDF) and return ONLY valid JSON (no markdown):\n${jsonSchema}\n${jsonInstructions}\n\nPDF text:\n${extractedText.slice(0, 8000)}` }],
        });
        const raw = resp.choices[0]?.message?.content ?? "{}";
        try { parsed = JSON.parse(raw); } catch { console.log("Non-JSON AI response:", raw.slice(0, 300)); continue; }
      } else {
        const id = crypto.randomUUID();
        const pdfTmp = path.join(os.tmpdir(), `test-${id}.pdf`);
        const imgPrefix = path.join(os.tmpdir(), `test-${id}`);
        tempFiles.push(pdfTmp);
        await fsp.writeFile(pdfTmp, buffer);

        await execFileAsync("pdftoppm", ["-jpeg", "-r", "150", pdfTmp, imgPrefix]).catch(e => { throw new Error("pdftoppm: " + e.message); });

        const allFiles = await fsp.readdir(os.tmpdir());
        const pageFiles = allFiles.filter(f => f.startsWith(`test-${id}`) && f.endsWith(".jpg")).sort().slice(0, 4);
        for (const f of pageFiles) tempFiles.push(path.join(os.tmpdir(), f));
        console.log(`Rendered ${pageFiles.length} page(s) for vision`);

        const imageContents = await Promise.all(pageFiles.map(async f => {
          const buf = await fsp.readFile(path.join(os.tmpdir(), f));
          return { type: "image_url", image_url: { url: `data:image/jpeg;base64,${buf.toString("base64")}`, detail: "high" } };
        }));

        const resp = await openai.chat.completions.create({
          model: "gpt-5.2",
          max_completion_tokens: 2048,
          messages: [{ role: "user", content: [
            { type: "text", text: `Pages from a receipt/order PDF. Extract receipt data, return ONLY valid JSON (no markdown):\n${jsonSchema}\n${jsonInstructions}` },
            ...imageContents,
          ]}],
        });
        const raw = resp.choices[0]?.message?.content ?? "{}";
        try { parsed = JSON.parse(raw); } catch { console.log("Non-JSON AI response:", raw.slice(0, 300)); continue; }
      }

      console.log("\nStore:  ", parsed.storeName);
      console.log("Date:   ", parsed.purchasedAt);
      console.log("Total:  $" + parsed.total);
      console.log("Items:  ", (parsed.lineItems ?? []).length);
      console.log("\nLine items:");
      for (const item of (parsed.lineItems ?? [])) {
        const name = (item.name ?? "").padEnd(38);
        const qty = String(item.quantity ?? 1).padStart(5);
        const price = ("$" + (item.price ?? 0)).padStart(8);
        console.log(`  ${item.icon ?? "?"} ${name} qty:${qty}  ${price}  [${item.category ?? "?"}]`);
      }
    } catch (err) {
      console.log("ERROR:", err.message);
    } finally {
      await Promise.all(tempFiles.map(f => fsp.unlink(f).catch(() => {})));
    }
  }
  console.log("\nDone.");
}

run().catch(e => { console.error(e); process.exit(1); });

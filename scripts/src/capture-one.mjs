// Re-capture a single App Store screenshot without redoing the whole set.
//
//   node scripts/src/capture-one.mjs 04-shopping /shopping "Regular,One-off,Best,$"
//
// Uses the same saved session as capture-screens.mjs — run that with --login
// first if you have not signed in yet.

import { mkdir } from "node:fs/promises";
import { captureScreen, launchBrowser, newPhoneContext, RAW_DIR, resolveBase } from "./captureBrowser.mjs";

const OUT = RAW_DIR;

const name = process.argv[2];
const path = process.argv[3];
const expect = (process.argv[4] || "$").split(",");

if (!name || !path) {
  console.error("usage: node scripts/src/capture-one.mjs <name> <path> [comma,separated,expected,text]");
  console.error('example: node scripts/src/capture-one.mjs 01-home / "Scan a receipt,Shopping List"');
  process.exit(1);
}

await mkdir(OUT, { recursive: true });

const browser = await launchBrowser();
const context = await newPhoneContext(browser);
const page = await context.newPage();

process.stdout.write("warming bundle... ");
await page.goto(`${resolveBase()}/`, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForTimeout(6000);
console.log("done");

try {
  await captureScreen(page, { name, path, expect }, OUT);
} finally {
  await browser.close();
}

console.log(`\nWrote ${OUT}/${name}.png`);

import { chromium } from "playwright-core";
import { mkdir } from "node:fs/promises";

const EXEC = process.env.REPLIT_PLAYWRIGHT_CHROMIUM_EXECUTABLE;
const DOMAIN = process.env.REPLIT_EXPO_DEV_DOMAIN;
if (!EXEC) throw new Error("REPLIT_PLAYWRIGHT_CHROMIUM_EXECUTABLE not set");
if (!DOMAIN) throw new Error("REPLIT_EXPO_DEV_DOMAIN not set");
const BASE = `https://${DOMAIN}`;

const OUT = "screenshots/raw";
await mkdir(OUT, { recursive: true });

const STORES = ["Costco", "Whole Foods", "Trader Joe", "Safeway", "Kroger", "Target", "Aldi", "Sprouts"];
const screens = [
  { name: "01-receipts", path: "/", expect: STORES },
  { name: "02-stores", path: "/stores", expect: STORES },
  { name: "03-shopping", path: "/shopping", expect: ["Regular", "One-off", "Best", "$"] },
  { name: "04-analytics", path: "/analytics", expect: ["week", "Spend", "Avg", "Highest", "Lowest", "$"] },
  { name: "05-catalog", path: "/catalog", expect: ["Produce", "Dairy", "Pantry", "Add", "Browse", "$"] },
];

const browser = await chromium.launch({ executablePath: EXEC, args: ["--no-sandbox"] });
const context = await browser.newContext({
  viewport: { width: 430, height: 932 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
});
const page = await context.newPage();

// Warm the bundle once.
process.stdout.write("warming bundle... ");
await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForTimeout(6000);
console.log("done");

for (const s of screens) {
  process.stdout.write(`capturing ${s.name} (${s.path}) ... `);
  await page.goto(`${BASE}${s.path}`, { waitUntil: "domcontentloaded", timeout: 60000 });
  let matched = false;
  try {
    await page.waitForFunction(
      (subs) => {
        const t = (document.body && document.body.innerText) || "";
        if (t.replace(/\s/g, "").length < 30) return false;
        return subs.some((x) => t.includes(x));
      },
      s.expect,
      { timeout: 20000 },
    );
    matched = true;
  } catch {
    matched = false;
  }
  // settle for fonts/icons/animations
  await page.waitForTimeout(1500);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/${s.name}.png`, fullPage: false });
  console.log(matched ? "OK (data matched)" : "captured (no match — check)");
}

await browser.close();
console.log("ALL DONE");

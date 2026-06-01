import { chromium } from "playwright-core";
import { mkdir } from "node:fs/promises";

const EXEC = process.env.REPLIT_PLAYWRIGHT_CHROMIUM_EXECUTABLE;
const DOMAIN = process.env.REPLIT_EXPO_DEV_DOMAIN;
const BASE = `https://${DOMAIN}`;
const OUT = "screenshots/raw";
await mkdir(OUT, { recursive: true });

const name = process.argv[2] || "05-catalog";
const path = process.argv[3] || "/catalog";
const expect = (process.argv[4] || "Produce,Dairy,Pantry,Add,Browse,$").split(",");

const browser = await chromium.launch({ executablePath: EXEC, args: ["--no-sandbox"] });
const context = await browser.newContext({
  viewport: { width: 430, height: 932 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
});
const page = await context.newPage();
process.stdout.write("warming... ");
await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForTimeout(6000);
console.log("done");

process.stdout.write(`capturing ${name} (${path}) ... `);
await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded", timeout: 60000 });
let matched = false;
try {
  await page.waitForFunction(
    (subs) => {
      const t = (document.body && document.body.innerText) || "";
      if (t.replace(/\s/g, "").length < 30) return false;
      return subs.some((x) => t.includes(x));
    },
    expect,
    { timeout: 20000 },
  );
  matched = true;
} catch {}
await page.waitForTimeout(1500);
await page.evaluate(() => window.scrollTo(0, 0));
await page.waitForTimeout(300);
await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: false });
console.log(matched ? "OK" : "captured (no match)");
await browser.close();

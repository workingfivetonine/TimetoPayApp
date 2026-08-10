// Captures the six App Store screenshots from the running web app at exactly
// iPhone 6.9" size (1290x2796), into screenshots/raw/.
//
//   pnpm --filter @workspace/scripts run capture:login    # once, to sign in
//   pnpm --filter @workspace/scripts run capture          # take the screenshots
//
// Then compose them into finished store images:
//   bash scripts/src/compose-appstore.sh
//
// Override the target with EXPO_DEV_DOMAIN (defaults to the live site) and the
// browser with PLAYWRIGHT_CHROMIUM_EXECUTABLE (auto-detected otherwise).

import { mkdir } from "node:fs/promises";
import {
  captureScreen,
  launchBrowser,
  newPhoneContext,
  RAW_DIR,
  resolveBase,
  runLogin,
} from "./captureBrowser.mjs";

const OUT = RAW_DIR;

const STORES = ["Costco", "Whole Foods", "Trader Joe", "Safeway", "Kroger", "Target", "Aldi", "Sprouts"];

// Home leads: it is the first screen anyone sees, so it is also the first thing
// anyone sees on the store listing. "/" is the hub; the receipts list is at
// /receipts since Home took over the root route.
const screens = [
  { name: "01-home", path: "/", expect: ["Scan a receipt", "Shopping List", "Browse Catalog"] },
  { name: "02-receipts", path: "/receipts", expect: STORES },
  { name: "03-stores", path: "/stores", expect: STORES },
  { name: "04-shopping", path: "/shopping", expect: ["Regular", "One-off", "Best", "$"] },
  { name: "05-analytics", path: "/analytics", expect: ["week", "Spend", "Avg", "Highest", "Lowest", "$"] },
  { name: "06-catalog", path: "/catalog", expect: ["Produce", "Dairy", "Pantry", "Add", "Browse", "$"] },
];

if (process.argv.includes("--login")) {
  await runLogin();
  process.exit(0);
}

await mkdir(OUT, { recursive: true });

const browser = await launchBrowser();
const context = await newPhoneContext(browser);
const page = await context.newPage();

// Warm the bundle once — the first paint of an Expo web build is slow enough
// to poison the first screenshot otherwise.
process.stdout.write("warming bundle... ");
await page.goto(`${resolveBase()}/`, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForTimeout(6000);
console.log("done");

const unmatched = [];
try {
  for (const screen of screens) {
    const matched = await captureScreen(page, screen, OUT);
    if (!matched) unmatched.push(screen.name);
  }
} finally {
  await browser.close();
}

console.log(`\nWrote ${screens.length} screenshots to ${OUT}/`);
if (unmatched.length) {
  console.log(
    `\nCheck these before composing — expected content was missing, which usually\n` +
      `means the account has no data on that screen: ${unmatched.join(", ")}`,
  );
}
console.log("\nNext: bash scripts/src/compose-appstore.sh");

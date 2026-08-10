// Captures the two screenshots the PWA install manifest (server/serve.js's
// buildWebManifest) declares, at the exact sizes it advertises to the browser's
// install dialog. Separate from capture-screens.mjs/capture-one.mjs because
// those are locked to a phone viewport (newPhoneContext) — the manifest's
// "wide" form factor genuinely needs a desktop-width window to show the real
// desktop sidebar layout, not a phone screen stretched out.
//
//   node scripts/src/capture-pwa-screenshots.mjs
//
// Uses the same saved session as the other capture scripts (run capture:login
// first if you haven't signed in yet).
import { launchBrowser, resolveBase, AUTH_STATE } from "./captureBrowser.mjs";
import { existsSync } from "node:fs";

if (!existsSync(AUTH_STATE)) {
  console.error(`No saved session at ${AUTH_STATE}. Run capture:login first.`);
  process.exit(1);
}

const TARGETS = [
  { out: "artifacts/receipt-tracker/assets/pwa/screenshot-mobile.png", viewport: { width: 414, height: 896 }, isMobile: true },
  { out: "artifacts/receipt-tracker/assets/pwa/screenshot-desktop.png", viewport: { width: 1280, height: 800 }, isMobile: false },
];

const browser = await launchBrowser();
for (const t of TARGETS) {
  const context = await browser.newContext({
    viewport: t.viewport,
    deviceScaleFactor: 1,
    isMobile: t.isMobile,
    storageState: AUTH_STATE,
  });
  const page = await context.newPage();
  await page.goto(`${resolveBase()}/`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(5000);

  // A fresh Playwright context has no "seen the welcome tour" flag even with
  // the saved auth cookie restored (that flag lives in AsyncStorage/localStorage,
  // which storageState only carries if it was captured at save time), so the
  // tour modal covers the screen on every run. Dismiss it before shooting.
  const skip = page.getByText("Skip", { exact: true });
  if (await skip.isVisible({ timeout: 3000 }).catch(() => false)) {
    await skip.click();
    await page.waitForTimeout(500);
  }

  await page.screenshot({ path: t.out });
  await context.close();
  console.log(`Wrote ${t.out}`);
}
await browser.close();

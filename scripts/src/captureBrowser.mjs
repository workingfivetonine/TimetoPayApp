// Shared browser bootstrap for the App Store screenshot captures.
//
// Every screen worth photographing sits behind Clerk auth, and a fresh
// Playwright context is signed out — InitialLayout then redirects to /landing.
// So captures run against a saved session: sign in once with `--login`, and
// subsequent runs reuse the stored cookies.

import { chromium } from "playwright-core";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Anchor every path to the repo root, not the working directory: `pnpm --filter`
// runs scripts from the package folder, so a relative "screenshots/raw" would
// land in scripts/screenshots/raw. This makes both invocations equivalent.
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

/** Where the signed-in session is cached. Gitignored — it holds real cookies. */
export const AUTH_STATE = path.join(REPO_ROOT, "screenshots", ".auth.json");

/** Where raw device-sized screenshots are written, for compose-appstore.sh. */
export const RAW_DIR = path.join(REPO_ROOT, "screenshots", "raw");

/**
 * 430x932 at 3x renders to 1290x2796 — exactly the iPhone 6.9" App Store size,
 * so compose-appstore.sh never has to upscale.
 */
export const VIEWPORT = { width: 430, height: 932 };
export const DEVICE_SCALE = 3;

// playwright-core deliberately ships no browsers, so point it at a Chrome or
// Edge that is already installed rather than downloading a second copy.
const CHROMIUM_CANDIDATES = {
  win32: [
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
    "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  ],
  darwin: [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
  ],
  linux: [
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/usr/bin/microsoft-edge",
  ],
};

export function resolveChromium() {
  const fromEnv = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
  if (fromEnv) {
    if (!existsSync(fromEnv)) {
      throw new Error(`PLAYWRIGHT_CHROMIUM_EXECUTABLE is set but does not exist: ${fromEnv}`);
    }
    return fromEnv;
  }
  for (const candidate of CHROMIUM_CANDIDATES[process.platform] ?? []) {
    if (existsSync(candidate)) return candidate;
  }
  throw new Error(
    "No Chrome or Edge found. Install one, or set PLAYWRIGHT_CHROMIUM_EXECUTABLE to a Chromium binary.",
  );
}

/** Defaults to the live site; override for a local/preview build. */
export function resolveBase() {
  const domain = process.env.EXPO_DEV_DOMAIN || "5to9shopping.com";
  return domain.startsWith("http") ? domain.replace(/\/$/, "") : `https://${domain}`;
}

/** Public routes — landing on one of these means the session is dead. */
const SIGNED_OUT = ["/landing", "/sign-in", "/sign-up"];

export function looksSignedOut(url) {
  try {
    const { pathname } = new URL(url);
    return SIGNED_OUT.some((p) => pathname.startsWith(p));
  } catch {
    return false;
  }
}

export async function launchBrowser({ headed = false } = {}) {
  return chromium.launch({
    executablePath: resolveChromium(),
    headless: !headed,
    args: ["--no-sandbox"],
  });
}

export async function newPhoneContext(browser, { authed = true } = {}) {
  if (authed && !existsSync(AUTH_STATE)) {
    throw new Error(
      `No saved session at ${AUTH_STATE}.\n` +
        "Run the capture with --login first, sign in in the window that opens, and it will be saved.",
    );
  }
  return browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: DEVICE_SCALE,
    isMobile: true,
    hasTouch: true,
    ...(authed ? { storageState: AUTH_STATE } : {}),
  });
}

/**
 * Opens a real window, waits for a human to sign in, then saves the session.
 * Detects success by leaving the public routes rather than by watching for a
 * particular element, so it survives redesigns of the sign-in screen.
 */
export async function runLogin() {
  const base = resolveBase();
  const browser = await launchBrowser({ headed: true });
  const context = await browser.newContext({ viewport: { width: 480, height: 900 } });
  const page = await context.newPage();

  console.log(`\nOpening ${base} — sign in in the window that just opened.`);
  console.log("This window is only used to capture the session; nothing is uploaded.\n");
  await page.goto(base, { waitUntil: "domcontentloaded", timeout: 60000 });

  try {
    await page.waitForFunction(
      (publicPaths) => !publicPaths.some((p) => location.pathname.startsWith(p)),
      SIGNED_OUT,
      { timeout: 5 * 60 * 1000, polling: 500 },
    );
  } catch {
    await browser.close();
    throw new Error("Timed out waiting for sign-in (5 minutes). Nothing was saved.");
  }

  // Let Clerk finish writing its tokens before snapshotting storage.
  await page.waitForTimeout(2500);
  await mkdir(path.dirname(AUTH_STATE), { recursive: true });
  await context.storageState({ path: AUTH_STATE });
  await browser.close();
  console.log(`Signed in. Session saved to ${AUTH_STATE}.`);
  console.log("Re-run the capture without --login to take the screenshots.\n");
}

/**
 * Navigates and screenshots one screen. Throws rather than writing a file when
 * the session has expired — a silently-captured landing page is worse than a
 * loud failure, because it looks like a valid screenshot until App Review.
 */
export async function captureScreen(page, screen, outDir) {
  const base = resolveBase();
  process.stdout.write(`capturing ${screen.name} (${screen.path}) ... `);
  await page.goto(`${base}${screen.path}`, { waitUntil: "domcontentloaded", timeout: 60000 });

  if (looksSignedOut(page.url())) {
    throw new Error(
      `redirected to ${new URL(page.url()).pathname} — the saved session has expired. Re-run with --login.`,
    );
  }

  let matched = false;
  try {
    await page.waitForFunction(
      (subs) => {
        const t = (document.body && document.body.innerText) || "";
        if (t.replace(/\s/g, "").length < 30) return false;
        return subs.some((x) => t.includes(x));
      },
      screen.expect,
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
  await page.screenshot({ path: `${outDir}/${screen.name}.png`, fullPage: false });
  console.log(matched ? "OK (content matched)" : "captured (NO content match — check this one)");
  return matched;
}

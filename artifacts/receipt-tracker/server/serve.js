/**
 * Standalone production server for Expo static builds.
 *
 * Serves the output of build.js (static-build/) with two special routes:
 * - GET / or /manifest with expo-platform header → platform manifest JSON
 * - GET / without expo-platform → landing page HTML
 * Everything else falls through to static file serving from ./static-build/.
 *
 * Zero external dependencies — uses only Node.js built-ins (http, fs, path).
 */

const http = require("http");
const fs = require("fs");
const path = require("path");

const STATIC_ROOT = path.resolve(__dirname, "..", "static-build");
const WEB_ROOT = path.join(STATIC_ROOT, "web");
const WEB_INDEX = path.join(WEB_ROOT, "index.html");
const TEMPLATE_PATH = path.resolve(__dirname, "templates", "landing-page.html");
const basePath = (process.env.BASE_PATH || "/").replace(/\/+$/, "");

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".map": "application/json",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
};

function getBaseUrl(req) {
  const forwardedProto = req.headers["x-forwarded-proto"];
  const protocol = forwardedProto || "https";
  const host = req.headers["x-forwarded-host"] || req.headers["host"];
  return `${protocol}://${host}`;
}

function serveRobots(req, res) {
  const baseUrl = getBaseUrl(req);
  const body = `User-agent: *\nAllow: /\n\nSitemap: ${baseUrl}/sitemap.xml\n`;
  res.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
  res.end(body);
}

function serveSitemap(req, res) {
  const baseUrl = getBaseUrl(req);
  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url>\n    <loc>${CANONICAL_ORIGIN}/</loc>\n    <changefreq>weekly</changefreq>\n  </url>\n  <url>\n    <loc>${CANONICAL_ORIGIN}/pricing</loc>\n    <changefreq>monthly</changefreq>\n  </url>\n  <url>\n    <loc>${CANONICAL_ORIGIN}/privacy</loc>\n    <changefreq>yearly</changefreq>\n  </url>\n  <url>\n    <loc>${CANONICAL_ORIGIN}/support</loc>\n    <changefreq>yearly</changefreq>\n  </url>\n  <url>\n    <loc>${CANONICAL_ORIGIN}/donate</loc>\n    <changefreq>yearly</changefreq>\n  </url>\n</urlset>\n`;
  res.writeHead(200, { "content-type": "application/xml; charset=utf-8" });
  res.end(body);
}

// --- Legal / support pages (server-rendered, standalone) ----------------------
// These are real HTML documents (not the SPA shell) so the App Store reviewer,
// search crawlers, and any browser get actual content with no JS required.

const SUPPORT_EMAIL = process.env.SUPPORT_EMAIL || "support@5to9shopping.com";
const CANONICAL_ORIGIN = process.env.CANONICAL_ORIGIN || "https://5to9shopping.com";
const LEGAL_UPDATED = "June 1, 2026";

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Render an array of blocks: { p } paragraph, { list } bullet list, { sub } subheading.
function renderBlocks(blocks) {
  return blocks
    .map((b) => {
      if (b.p) return `<p>${b.p}</p>`;
      if (b.sub) return `<h3>${escapeHtml(b.sub)}</h3>`;
      if (b.list)
        return `<ul>${b.list.map((li) => `<li>${li}</li>`).join("")}</ul>`;
      return "";
    })
    .join("\n        ");
}

function buildLegalPage({ baseUrl, appName, title, slug, intro, sections }) {
  const safeBase = escapeHtml(baseUrl);
  const safeCanonical = escapeHtml(CANONICAL_ORIGIN);
  const sectionsHtml = sections
    .map(
      (s) => `<section>
        <h2>${escapeHtml(s.heading)}</h2>
        ${renderBlocks(s.blocks)}
      </section>`,
    )
    .join("\n      ");
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)} — ${escapeHtml(appName)}</title>
  <meta name="description" content="${escapeHtml(title)} for ${escapeHtml(appName)}." />
  <meta name="robots" content="index, follow" />
  <link rel="canonical" href="${safeCanonical}/${escapeHtml(slug)}" />
  <style>
    :root { color-scheme: light; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      color: #1e1b2e;
      background: #faf8ff;
      line-height: 1.65;
    }
    .hero {
      background: linear-gradient(135deg, #7c3aed 0%, #5b21b6 100%);
      color: #fff;
      padding: 56px 24px 40px;
    }
    .wrap { max-width: 760px; margin: 0 auto; }
    .hero h1 { margin: 0 0 8px; font-size: 30px; font-weight: 800; }
    .hero .updated { margin: 0; opacity: .85; font-size: 14px; }
    .hero a.back { color: #fff; opacity: .9; text-decoration: none; font-size: 14px; font-weight: 600; }
    main { padding: 36px 24px 64px; }
    .card {
      background: #fff;
      border: 1px solid #e7e1f5;
      border-radius: 16px;
      padding: 28px 28px 12px;
      box-shadow: 0 1px 2px rgba(30,27,46,.04);
    }
    .intro { font-size: 17px; color: #3d3658; margin-top: 0; }
    h2 { font-size: 20px; font-weight: 700; margin: 28px 0 8px; color: #1e1b2e; }
    h3 { font-size: 16px; font-weight: 700; margin: 18px 0 4px; color: #2d2842; }
    p, li { font-size: 15.5px; color: #45405c; }
    ul { padding-left: 20px; }
    a { color: #7c3aed; }
    section:first-of-type h2 { margin-top: 8px; }
    footer { max-width: 760px; margin: 0 auto; padding: 0 24px 56px; color: #6b6385; font-size: 13px; }
    footer a { color: #6b6385; font-weight: 600; }
  </style>
</head>
<body>
  <header class="hero">
    <div class="wrap">
      <a class="back" href="${safeBase}/">&larr; ${escapeHtml(appName)}</a>
      <h1>${escapeHtml(title)}</h1>
      <p class="updated">Last updated ${escapeHtml(LEGAL_UPDATED)}</p>
    </div>
  </header>
  <main>
    <div class="wrap">
      <div class="card">
        <p class="intro">${intro}</p>
      ${sectionsHtml}
      </div>
    </div>
  </main>
  <footer>
    <a href="${safeBase}/privacy">Privacy Policy</a> &middot;
    <a href="${safeBase}/support">Support</a> &middot;
    <a href="${safeBase}/">Home</a>
  </footer>
</body>
</html>
`;
}

function servePrivacy(req, res, appName) {
  const baseUrl = getBaseUrl(req);
  const html = buildLegalPage({
    baseUrl,
    appName,
    title: "Privacy Policy",
    slug: "privacy",
    intro: `${escapeHtml(appName)} ("we", "us") helps you scan grocery receipts, track prices over time, and build a smart shopping list. This policy explains what information the app collects, how it is used, and the choices you have. Your data is private to your account.`,
    sections: [
      {
        heading: "Information We Collect",
        blocks: [
          {
            list: [
              "<strong>Account information</strong> — your email address, handled by our authentication provider (Clerk) when you create an account or sign in.",
              "<strong>Receipt data</strong> — the receipt photos you choose to scan, and the information extracted from them: store names, item names, prices, quantities, dates, and totals.",
              "<strong>App content you add</strong> — stores, delivery fees, shopping-list items, notes, and any manual edits you make.",
            ],
          },
          {
            p: "We do not collect your contacts, precise location, or advertising identifiers, and we do not use third-party advertising or tracking SDKs.",
          },
        ],
      },
      {
        heading: "How We Use Your Information",
        blocks: [
          {
            list: [
              "To extract items and prices from the receipts you scan.",
              "To track price history, surface the best store and price for items you buy, and build your shopping list.",
              "To keep your data associated with your account and available across your devices.",
              "To operate, secure, and improve the app.",
            ],
          },
        ],
      },
      {
        heading: "AI Processing of Receipts",
        blocks: [
          {
            p: "When you scan a receipt, the image is sent to our AI provider (OpenAI) solely to read the text and return the items, prices, and store. We do not use your receipts to train AI models. Images are processed to provide the feature and are not shared for any other purpose.",
          },
        ],
      },
      {
        heading: "How Your Information Is Shared",
        blocks: [
          {
            p: "We do not sell your personal information. We share data only with service providers that help us run the app, and only as needed to provide it:",
          },
          {
            list: [
              "<strong>Clerk</strong> — account authentication and sign-in.",
              "<strong>OpenAI</strong> — reading the receipts you scan.",
              "<strong>Replit</strong> — application hosting and database storage.",
            ],
          },
          {
            p: "We may also disclose information if required by law or to protect the rights and safety of our users.",
          },
        ],
      },
      {
        heading: "Data Storage & Security",
        blocks: [
          {
            p: "Your data is stored in a managed PostgreSQL database. Each record is tied to your account, and access is restricted to your authenticated session. We use industry-standard measures to protect your information, though no method of transmission or storage is completely secure.",
          },
        ],
      },
      {
        heading: "Your Choices & Data Retention",
        blocks: [
          {
            list: [
              "You can edit or delete individual items, receipts, and stores at any time from within the app.",
              "Deleting a receipt or store also removes its associated line items.",
              "You can request deletion of your account and all associated data by contacting us at the email below.",
            ],
          },
        ],
      },
      {
        heading: "Children's Privacy",
        blocks: [
          {
            p: "The app is not directed to children under 13, and we do not knowingly collect personal information from them.",
          },
        ],
      },
      {
        heading: "Changes to This Policy",
        blocks: [
          {
            p: "We may update this policy from time to time. Material changes will be reflected by updating the date at the top of this page.",
          },
        ],
      },
      {
        heading: "Contact Us",
        blocks: [
          {
            p: `Questions about this policy? Email us at <a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a>.`,
          },
        ],
      },
    ],
  });
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  res.end(html);
}

const DONATE_URL = process.env.DONATE_URL || "https://ko-fi.com/timetopay";

function serveDonate(req, res, appName) {
  const baseUrl = getBaseUrl(req);
  const html = buildLegalPage({
    baseUrl,
    appName,
    title: "Support Our Work",
    slug: "donate",
    intro: `${escapeHtml(appName)} is built by a small team passionate about helping families spend less on groceries. If it saves you money, a small donation goes a long way — thank you!`,
    sections: [
      {
        heading: "Why Donate?",
        blocks: [
          {
            list: [
              "<strong>Keep the servers running</strong> — AI receipt scanning and price tracking cost real money to operate.",
              "<strong>Fund new features</strong> — your support lets us build smarter price alerts, store comparisons, and more.",
              "<strong>Support an indie project</strong> — TimetoPay has no investors or ads. It's just us, trying to help people save money.",
            ],
          },
        ],
      },
      {
        heading: "How to Donate",
        blocks: [
          {
            p: `We accept one-time and recurring donations via Ko-fi. Any amount is deeply appreciated. <a href="${DONATE_URL}" target="_blank" rel="noopener">Donate on Ko-fi &rarr;</a>`,
          },
        ],
      },
      {
        heading: "Other Ways to Help",
        blocks: [
          {
            list: [
              "Tell a friend or family member about TimetoPay.",
              "Share it on social media.",
              "Send us feedback — it helps us improve the app for everyone.",
            ],
          },
        ],
      },
      {
        heading: "Contact",
        blocks: [
          {
            p: `Have questions or want to get in touch? Email us at <a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a>.`,
          },
        ],
      },
    ],
  });
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  res.end(html);
}

function serveSupport(req, res, appName) {
  const baseUrl = getBaseUrl(req);
  const html = buildLegalPage({
    baseUrl,
    appName,
    title: "Support",
    slug: "support",
    intro: `Need help with ${escapeHtml(appName)}? You'll find answers to common questions below. If you're still stuck, email us — we're happy to help.`,
    sections: [
      {
        heading: "Getting Started",
        blocks: [
          {
            list: [
              "<strong>Scan a receipt</strong> — tap Scan, point your camera at a receipt (or upload a photo), and the app reads the items and prices automatically.",
              "<strong>Review & save</strong> — check the extracted items, make any edits, and save. The store and items are added to your history.",
              "<strong>Track & shop</strong> — see price history in Analytics, and use the Shopping List and Browse Catalog to plan your next trip at the best price.",
            ],
          },
        ],
      },
      {
        heading: "Frequently Asked Questions",
        blocks: [
          { sub: "How does receipt scanning work?" },
          {
            p: "The app uses AI to read your receipt photo and pull out each item, its price, the store, and the date — so you don't have to type anything.",
          },
          { sub: "How are prices tracked?" },
          {
            p: "Every time you scan a receipt, the app records what each item cost and where. Over time it shows you the lowest, average, and highest price, and which store is cheapest.",
          },
          { sub: "How do I build my shopping list?" },
          {
            p: "Items you buy regularly are added automatically, and you can add anything from Browse Catalog. Export a printable list grouped by store from the Shopping List tab.",
          },
          { sub: "How do I reset my password?" },
          {
            p: "On the sign-in screen, tap “Forgot password?” to receive a reset code by email and set a new password.",
          },
          { sub: "How do I delete my data or account?" },
          {
            p: "You can delete individual items, receipts, and stores in the app. To delete your entire account and all data, email us at the address below.",
          },
          { sub: "Does the camera work on the web?" },
          {
            p: "Receipt capture by camera is available in the mobile app. On the web, you can upload a receipt photo instead.",
          },
        ],
      },
      {
        heading: "Contact Us",
        blocks: [
          {
            p: `Still need help? Email <a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a> and we'll get back to you.`,
          },
        ],
      },
    ],
  });
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  res.end(html);
}

function getAppName() {
  try {
    const appJsonPath = path.resolve(__dirname, "..", "app.json");
    const appJson = JSON.parse(fs.readFileSync(appJsonPath, "utf-8"));
    return appJson.expo?.name || "App Landing Page";
  } catch {
    return "App Landing Page";
  }
}

function serveManifest(platform, res) {
  const manifestPath = path.join(STATIC_ROOT, platform, "manifest.json");

  if (!fs.existsSync(manifestPath)) {
    res.writeHead(404, { "content-type": "application/json" });
    res.end(
      JSON.stringify({ error: `Manifest not found for platform: ${platform}` }),
    );
    return;
  }

  const manifest = fs.readFileSync(manifestPath, "utf-8");
  res.writeHead(200, {
    "content-type": "application/json",
    "expo-protocol-version": "1",
    "expo-sfv-version": "0",
  });
  res.end(manifest);
}

function serveLandingPage(req, res, landingPageTemplate, appName) {
  const forwardedProto = req.headers["x-forwarded-proto"];
  const protocol = forwardedProto || "https";
  const host = req.headers["x-forwarded-host"] || req.headers["host"];
  const baseUrl = `${protocol}://${host}`;
  const expsUrl = `${host}`;

  const html = landingPageTemplate
    .replace(/BASE_URL_PLACEHOLDER/g, baseUrl)
    .replace(/EXPS_URL_PLACEHOLDER/g, expsUrl)
    .replace(/APP_NAME_PLACEHOLDER/g, appName);

  res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  res.end(html);
}

function buildSeoHead(baseUrl, appName) {
  const desc = `${appName} scans your receipts with AI, tracks grocery prices over time, and builds a smart shopping list.`;
  const ogDesc =
    "Scan receipts with AI, track grocery prices over time, and build a smart shopping list.";
  const tags = [
    `<meta name="description" content="${desc}" />`,
    `<meta name="robots" content="index, follow" />`,
    `<link rel="canonical" href="${CANONICAL_ORIGIN}/" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="${appName}" />`,
    `<meta property="og:title" content="${appName} — Scan receipts, track prices, smart shopping list" />`,
    `<meta property="og:description" content="${ogDesc}" />`,
    `<meta property="og:url" content="${CANONICAL_ORIGIN}/" />`,
    `<meta name="twitter:card" content="summary" />`,
    `<meta name="twitter:title" content="${appName}" />`,
    `<meta name="twitter:description" content="${ogDesc}" />`,
  ];
  return tags.join("\n    ");
}

function injectSeo(html, baseUrl, appName) {
  const seoTitle = `${appName} — Scan receipts, track prices, smart shopping list`;
  let out = html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${seoTitle}</title>`);
  out = out.replace(
    /<\/head>/i,
    `    ${buildSeoHead(baseUrl, appName)}\n  </head>`,
  );
  return out;
}

let _webIndexRaw = null;
function getWebIndexRaw() {
  if (_webIndexRaw === null && fs.existsSync(WEB_INDEX)) {
    _webIndexRaw = fs.readFileSync(WEB_INDEX, "utf-8");
  }
  return _webIndexRaw;
}

// Serve the real browser web app (Expo web export) with SEO meta injected.
// Falls back to the Expo Go QR landing page if the web build is unavailable.
function serveWebApp(req, res, landingPageTemplate, appName) {
  const raw = getWebIndexRaw();
  if (!raw) {
    return serveLandingPage(req, res, landingPageTemplate, appName);
  }
  const forwardedProto = req.headers["x-forwarded-proto"];
  const protocol = forwardedProto || "https";
  const host = req.headers["x-forwarded-host"] || req.headers["host"];
  const baseUrl = `${protocol}://${host}`;

  const html = injectSeo(raw, baseUrl, appName);
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  res.end(html);
}

// Resolve a request path to a real file, checking the web build first, then the
// Expo Go static build (timestamped bundles/assets/manifests).
function resolveStaticFile(urlPath) {
  const safePath = path.normalize(urlPath).replace(/^(\.\.(\/|\\|$))+/, "");
  for (const root of [WEB_ROOT, STATIC_ROOT]) {
    const filePath = path.join(root, safePath);
    if (!filePath.startsWith(root)) continue;
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      return filePath;
    }
  }
  return null;
}

function serveFile(filePath, res) {
  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || "application/octet-stream";
  const content = fs.readFileSync(filePath);
  res.writeHead(200, { "content-type": contentType });
  res.end(content);
}

const landingPageTemplate = fs.readFileSync(TEMPLATE_PATH, "utf-8");
const appName = getAppName();

const server = http.createServer((req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host}`);
  let pathname = url.pathname;

  if (basePath && pathname.startsWith(basePath)) {
    pathname = pathname.slice(basePath.length) || "/";
  }

  if (pathname === "/robots.txt") {
    return serveRobots(req, res);
  }

  if (pathname === "/sitemap.xml") {
    return serveSitemap(req, res);
  }

  if (pathname === "/privacy") {
    return servePrivacy(req, res, appName);
  }

  if (pathname === "/support") {
    return serveSupport(req, res, appName);
  }

  if (pathname === "/donate") {
    return serveDonate(req, res, appName);
  }

  if (pathname === "/" || pathname === "/manifest") {
    const platform = req.headers["expo-platform"];
    if (platform === "ios" || platform === "android") {
      return serveManifest(platform, res);
    }

    if (pathname === "/") {
      return serveWebApp(req, res, landingPageTemplate, appName);
    }
  }

  const filePath = resolveStaticFile(pathname);
  if (filePath) {
    return serveFile(filePath, res);
  }

  // SPA fallback: client-side routes (no file extension) render the web app
  // shell so deep links like /catalog or /receipt/123 work on reload.
  if (!path.extname(pathname)) {
    return serveWebApp(req, res, landingPageTemplate, appName);
  }

  res.writeHead(404);
  res.end("Not Found");
});

const port = parseInt(process.env.PORT || "3000", 10);
server.listen(port, "0.0.0.0", () => {
  console.log(`Serving static Expo build on port ${port}`);
});

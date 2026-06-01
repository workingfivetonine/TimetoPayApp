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
  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url>\n    <loc>${baseUrl}/</loc>\n    <changefreq>weekly</changefreq>\n  </url>\n</urlset>\n`;
  res.writeHead(200, { "content-type": "application/xml; charset=utf-8" });
  res.end(body);
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
    `<link rel="canonical" href="${baseUrl}/" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:title" content="${appName} — Scan receipts, track prices, smart shopping list" />`,
    `<meta property="og:description" content="${ogDesc}" />`,
    `<meta property="og:url" content="${baseUrl}/" />`,
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

// Native (and default) no-op. Vercel Web Analytics only runs on the web build;
// Metro resolves VercelAnalytics.web.tsx for web and this file everywhere else,
// keeping @vercel/analytics out of the native bundle.
export function VercelAnalytics() {
  return null;
}

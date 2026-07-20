import { Analytics } from "@vercel/analytics/react";

// Vercel Web Analytics — WEB ONLY. Renders nothing visible; it injects the
// Vercel analytics script and reports page views + client-side route changes
// for the deployed site (5to9shopping.com). Cookieless / privacy-friendly.
// The native build resolves the sibling VercelAnalytics.tsx (a no-op), so
// @vercel/analytics never enters the iOS/Android bundle.
export function VercelAnalytics() {
  return <Analytics />;
}

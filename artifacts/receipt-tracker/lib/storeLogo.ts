// Client-side store-logo resolution, mirroring the server's resolveStoreLogo.
// Used as a fallback so a store shows a logo even when the DB `logoUrl` is null
// (e.g. the boot-time backfill hasn't run for it yet). Deterministic, no network.
const KNOWN_DOMAINS: Record<string, string> = {
  "whole foods": "wholefoodsmarket.com",
  "whole foods market": "wholefoodsmarket.com",
  "trader joe's": "traderjoes.com",
  "trader joes": "traderjoes.com",
  "sam's club": "samsclub.com",
  "bj's": "bjs.com",
  "bj's wholesale": "bjs.com",
  "stop & shop": "stopandshop.com",
  "stop and shop": "stopandshop.com",
  "h-e-b": "heb.com",
  heb: "heb.com",
  aldi: "aldi.us",
  "the fresh market": "thefreshmarket.com",
  "fresh market": "thefreshmarket.com",
  "fred meyer": "fredmeyer.com",
  "harris teeter": "harristeeter.com",
  "food lion": "foodlion.com",
  "giant eagle": "gianteagle.com",
  sprouts: "sprouts.com",
  "sprouts farmers market": "sprouts.com",
};

function inferDomain(name: string): string | null {
  const lower = name.trim().toLowerCase();
  if (!lower) return null;
  if (KNOWN_DOMAINS[lower]) return KNOWN_DOMAINS[lower];
  const slug = lower.replace(/['’&,.-]/g, "").replace(/\s+/g, "");
  return slug ? `${slug}.com` : null;
}

// Logo.dev publishable token (safe to ship client-side). Free tier requires a
// visible "Logos by Logo.dev" attribution somewhere in the app.
const LOGODEV_TOKEN = "pk_N8ZWY_DGQU-5uzLqYBrKMQ";

// A brand-logo URL for a store name via logo.dev. Returns the real brand logo
// for recognizable retailers and a clean initials "monogram" otherwise (always
// a valid image, so logos never come back blank the way favicons did).
export function storeLogoUrl(name: string | null | undefined): string | null {
  if (!name) return null;
  const domain = inferDomain(name);
  if (!domain) return null;
  return `https://img.logo.dev/${encodeURIComponent(domain)}?token=${LOGODEV_TOKEN}&size=128&format=png&retina=true`;
}

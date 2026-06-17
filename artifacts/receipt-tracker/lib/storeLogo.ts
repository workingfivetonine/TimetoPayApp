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

// A favicon URL for a store name (Google's favicon service). Returns a real icon
// for recognizable retailers and a generic globe otherwise; callers should fall
// back to a placeholder icon when the <Image> fails to load.
export function storeLogoUrl(name: string | null | undefined): string | null {
  if (!name) return null;
  const domain = inferDomain(name);
  if (!domain) return null;
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128`;
}

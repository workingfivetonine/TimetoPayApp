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
  "heb": "heb.com",
  "aldi": "aldi.us",
  "the fresh market": "thefreshmarket.com",
  "fresh market": "thefreshmarket.com",
  "winco": "wincofoods.com",
  "winco foods": "wincofoods.com",
  "dollar tree": "dollartree.com",
  "dollar general": "dollargeneral.com",
  "family dollar": "familydollar.com",
  "tj maxx": "tjmaxx.com",
  "t.j. maxx": "tjmaxx.com",
  "home goods": "homegoods.com",
  "macy's": "macys.com",
  "nordstrom rack": "nordstromrack.com",
  "natural grocers": "naturalgrocers.com",
  "smart & final": "smartandfinal.com",
  "smart and final": "smartandfinal.com",
  "fred meyer": "fredmeyer.com",
  "harris teeter": "harristeeter.com",
  "winn-dixie": "winndixie.com",
  "winn dixie": "winndixie.com",
  "food lion": "foodlion.com",
  "giant food": "giantfood.com",
  "giant eagle": "gianteagle.com",
  "price chopper": "pricechopper.com",
  "big lots": "biglots.com",
  "ross": "rossstores.com",
  "ross dress for less": "rossstores.com",
  "99 cents only": "99only.com",
  "grocery outlet": "groceryoutlet.com",
  "sprouts": "sprouts.com",
  "sprouts farmers market": "sprouts.com",
};

function inferDomain(name: string): string {
  const lower = name.trim().toLowerCase();
  if (KNOWN_DOMAINS[lower]) return KNOWN_DOMAINS[lower];
  // Strip apostrophes, ampersands, hyphens, then collapse spaces
  const slug = lower.replace(/['’&,.-]/g, "").replace(/\s+/g, "");
  return `${slug}.com`;
}

// Logo.dev publishable token (safe to ship client-side).
const LOGODEV_TOKEN = "pk_N8ZWY_DGQU-5uzLqYBrKMQ";

export function resolveStoreLogo(storeName: string): string | null {
  const domain = inferDomain(storeName);
  if (!domain) return null;
  // logo.dev returns the retailer's real brand logo for known domains and a
  // clean initials monogram otherwise — always a valid PNG (no blank favicons).
  // Deterministic (no network call here). Free tier needs a "Logos by Logo.dev"
  // attribution, shown on the Stores screen.
  return `https://img.logo.dev/${encodeURIComponent(domain)}?token=${LOGODEV_TOKEN}&size=128&format=png&retina=true`;
}

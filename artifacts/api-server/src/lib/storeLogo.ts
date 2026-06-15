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

export function resolveStoreLogo(storeName: string): string | null {
  const domain = inferDomain(storeName);
  if (!domain) return null;
  // Clearbit's free logo API (logo.clearbit.com) was shut down in late 2025, so
  // we use Google's favicon service. It returns the retailer's icon for known
  // domains and a generic globe otherwise; StoreCard falls back to a shopping-bag
  // icon when the image fails to load. Deterministic (no network call here).
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128`;
}

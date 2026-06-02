// Single source of truth for "where does tapping a store's shop link go".
//
// Today this is either the admin-set official website, or a web-search
// fallback built from the store name/address. This is the deliberate insertion
// point for a future affiliate / online-ordering link (Instacart, etc.): when
// that lands, resolve it here and the store detail UI needs no changes.

export type StoreLinkTarget = {
  url: string;
  // true  -> the store's real website (admin-set on the catalog store)
  // false -> a web-search fallback (no website on file yet)
  isOfficial: boolean;
};

export function resolveStoreLink(opts: {
  websiteUrl?: string | null;
  storeName: string;
  address?: string | null;
}): StoreLinkTarget {
  const site = opts.websiteUrl?.trim();
  if (site) return { url: site, isOfficial: true };

  const query = [opts.storeName, opts.address]
    .map((p) => p?.trim())
    .filter(Boolean)
    .join(" ");
  return {
    url: `https://www.google.com/search?q=${encodeURIComponent(query)}`,
    isOfficial: false,
  };
}

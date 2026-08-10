// What counts as a price you actually paid.
//
// A line item can legitimately carry no price. "Log Items" (quick-add) stores
// `parseFloat(price) || 0`, so leaving the field blank saves 0.00, and receipt
// parsing can also come back without a price for a line. Those rows are real
// purchases and must still count for "last purchased" and purchase counts —
// but they are not prices, and treating them as such made `Math.min` report
// "lowest price ever paid: $0.00" permanently, with the shopping list then
// claiming savings equal to the entire average.
//
// Filtering on read rather than at input is deliberate: it repairs rows already
// in the database with no migration, and logging an item without its price is a
// legitimate thing to want to do.
export function isRealPrice(price: unknown): boolean {
  const n = Number(price);
  return Number.isFinite(n) && n > 0;
}

export interface PriceStats {
  average: number;
  lowest: number;
  highest: number;
  /** Index of the lowest price within the array that was passed in. */
  lowestIndex: number;
}

/**
 * Aggregate stats over prices that have already been filtered with
 * `isRealPrice`. Returns null when nothing priced is left, which callers should
 * surface as "no price known" rather than as zero.
 */
export function priceStats(prices: number[]): PriceStats | null {
  if (!prices.length) return null;

  const lowest = Math.min(...prices);
  return {
    average: Math.round((prices.reduce((a, b) => a + b, 0) / prices.length) * 100) / 100,
    lowest,
    highest: Math.max(...prices),
    lowestIndex: prices.indexOf(lowest),
  };
}

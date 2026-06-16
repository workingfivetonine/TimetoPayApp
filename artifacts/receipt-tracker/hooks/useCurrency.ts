import { useGetCurrentUser } from "@workspace/api-client-react";
import { currencyForCountry, formatPrice } from "@workspace/geo";

// Visual-only currency for the signed-in user, derived from their saved country
// (defaults to USD). We never convert money — this just picks the right symbol
// so a UK user sees "£3.50" and an Israeli user sees "₪3.50" for the exact
// numbers on their receipts. Reuses the cached /me query (no extra request).
export function useCurrency() {
  const { data: me } = useGetCurrentUser();
  const countryCode =
    (me as { countryCode?: string | null } | undefined)?.countryCode ?? null;
  const currency = currencyForCountry(countryCode);
  return {
    ...currency,
    countryCode,
    // format(3.5) → "£3.50"; format(null) → "—"
    format: (amount: number | string | null | undefined) =>
      formatPrice(amount, countryCode),
  };
}

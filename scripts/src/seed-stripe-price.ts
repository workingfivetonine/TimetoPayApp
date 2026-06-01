import { getUncachableStripeClient } from "./stripeClient";

// Idempotently seeds the "Receipt Tracker Pro" product + a $5.99/mo recurring
// price. Re-running reuses the existing product/price instead of duplicating.
// Prints the price id to stdout (set it as STRIPE_PRICE_ID, or let the billing
// route auto-discover the active recurring price).

const PRODUCT_NAME = "Receipt Tracker Pro";
const UNIT_AMOUNT = 599; // $5.99 in cents
const CURRENCY = "usd";

async function main(): Promise<void> {
  const stripe = await getUncachableStripeClient();

  // Find or create the product (search by name across active products).
  const products = await stripe.products.list({ active: true, limit: 100 });
  let product = products.data.find((p) => p.name === PRODUCT_NAME);
  if (!product) {
    product = await stripe.products.create({ name: PRODUCT_NAME });
    console.log(`Created product ${product.id}`);
  } else {
    console.log(`Reusing product ${product.id}`);
  }

  // Find or create a matching recurring price.
  const prices = await stripe.prices.list({
    product: product.id,
    active: true,
    limit: 100,
  });
  let price = prices.data.find(
    (p) =>
      p.unit_amount === UNIT_AMOUNT &&
      p.currency === CURRENCY &&
      p.recurring?.interval === "month",
  );
  if (!price) {
    price = await stripe.prices.create({
      product: product.id,
      unit_amount: UNIT_AMOUNT,
      currency: CURRENCY,
      recurring: { interval: "month" },
    });
    console.log(`Created price ${price.id}`);
  } else {
    console.log(`Reusing price ${price.id}`);
  }

  console.log(`STRIPE_PRICE_ID=${price.id}`);
}

main().catch((err) => {
  console.error("seed-stripe-price failed:", err);
  process.exit(1);
});

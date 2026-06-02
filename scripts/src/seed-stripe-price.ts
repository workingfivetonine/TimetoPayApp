import { getUncachableStripeClient } from "./stripeClient";

// Idempotently seeds the "Receipt Tracker Pro" product + a $5.99/mo recurring
// price. Re-running reuses the existing product/price instead of duplicating.
// Prints the price id to stdout (set it as STRIPE_PRICE_ID, or let the billing
// route auto-discover the active recurring price).
//
// By default this targets the DEVELOPMENT (test-mode) Stripe connection when run
// from the workspace. To seed the LIVE price after activating a live Stripe
// account, run against the production connection:
//   STRIPE_CONNECTOR_ENVIRONMENT=production pnpm --filter @workspace/scripts run seed-stripe-price
// then set the printed STRIPE_PRICE_ID as the PRODUCTION secret.

const PRODUCT_NAME = "Receipt Tracker Pro";
const UNIT_AMOUNT = 599; // $5.99 in cents (monthly)
const ANNUAL_UNIT_AMOUNT = 7188; // $71.88 in cents (12 × $5.99, annual list price)
const CURRENCY = "usd";
// The post-trial 20%-off annual offer. Applied as a checkout discount on the
// annual price. duration "once" = 20% off the FIRST year, renews at full price.
const ANNUAL_COUPON_NAME = "Annual 20% off (first year)";
const ANNUAL_COUPON_PERCENT = 20;

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

  // Find or create the annual recurring price ($71.88/yr).
  let annualPrice = prices.data.find(
    (p) =>
      p.unit_amount === ANNUAL_UNIT_AMOUNT &&
      p.currency === CURRENCY &&
      p.recurring?.interval === "year",
  );
  if (!annualPrice) {
    annualPrice = await stripe.prices.create({
      product: product.id,
      unit_amount: ANNUAL_UNIT_AMOUNT,
      currency: CURRENCY,
      recurring: { interval: "year" },
    });
    console.log(`Created annual price ${annualPrice.id}`);
  } else {
    console.log(`Reusing annual price ${annualPrice.id}`);
  }

  // Find or create the 20%-off coupon for the annual offer (first year only).
  const coupons = await stripe.coupons.list({ limit: 100 });
  let coupon = coupons.data.find(
    (c) =>
      c.valid &&
      c.percent_off === ANNUAL_COUPON_PERCENT &&
      c.duration === "once" &&
      c.name === ANNUAL_COUPON_NAME,
  );
  if (!coupon) {
    coupon = await stripe.coupons.create({
      name: ANNUAL_COUPON_NAME,
      percent_off: ANNUAL_COUPON_PERCENT,
      duration: "once",
    });
    console.log(`Created annual coupon ${coupon.id}`);
  } else {
    console.log(`Reusing annual coupon ${coupon.id}`);
  }

  console.log(`STRIPE_PRICE_ID=${price.id}`);
  console.log(`STRIPE_ANNUAL_PRICE_ID=${annualPrice.id}`);
  console.log(`STRIPE_ANNUAL_COUPON_ID=${coupon.id}`);
}

main().catch((err) => {
  console.error("seed-stripe-price failed:", err);
  process.exit(1);
});

// Idempotently seeds a PayPal product + a $5.99/mo billing plan with a 30-day
// free trial. Prints PAYPAL_PLAN_ID to stdout — set it as the env var the
// billing route reads.
//
// Requires env: PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET, optional PAYPAL_API_BASE
// (defaults to sandbox).

const API_BASE = (
  process.env.PAYPAL_API_BASE?.replace(/\/+$/, "") ||
  "https://api-m.sandbox.paypal.com"
).trim();
const PRODUCT_NAME = "Receipt Tracker Pro";
const PLAN_NAME = "Receipt Tracker Pro Monthly";
const PRICE = "5.99";
const CURRENCY = "USD";
const TRIAL_DAYS = 30;

async function token(): Promise<string> {
  const id = process.env.PAYPAL_CLIENT_ID;
  const secret = process.env.PAYPAL_CLIENT_SECRET;
  if (!id || !secret) {
    throw new Error(
      "PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET must be set to seed a PayPal plan.",
    );
  }
  const auth = Buffer.from(`${id}:${secret}`).toString("base64");
  const resp = await fetch(`${API_BASE}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!resp.ok) throw new Error(`token failed: ${resp.status} ${await resp.text()}`);
  return ((await resp.json()) as { access_token: string }).access_token;
}

async function api<T>(t: string, path: string, body: unknown): Promise<T> {
  const resp = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${t}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await resp.text();
  if (!resp.ok) throw new Error(`${path} failed: ${resp.status} ${text}`);
  return (text ? JSON.parse(text) : null) as T;
}

async function listGet<T>(t: string, path: string): Promise<T> {
  const resp = await fetch(`${API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${t}`, "Content-Type": "application/json" },
  });
  const text = await resp.text();
  if (!resp.ok) throw new Error(`${path} failed: ${resp.status} ${text}`);
  return (text ? JSON.parse(text) : null) as T;
}

async function main(): Promise<void> {
  const t = await token();

  // Find or create the product.
  const products = await listGet<{ products?: Array<{ id: string; name: string }> }>(
    t,
    "/v1/catalogs/products?page_size=20",
  );
  let productId = products.products?.find((p) => p.name === PRODUCT_NAME)?.id;
  if (!productId) {
    const product = await api<{ id: string }>(t, "/v1/catalogs/products", {
      name: PRODUCT_NAME,
      type: "SERVICE",
      category: "SOFTWARE",
    });
    productId = product.id;
    console.log(`Created product ${productId}`);
  } else {
    console.log(`Reusing product ${productId}`);
  }

  // Find an existing active plan for this product with a matching name.
  const plans = await listGet<{ plans?: Array<{ id: string; name: string; status: string }> }>(
    t,
    `/v1/billing/plans?product_id=${productId}&page_size=20`,
  );
  const existing = plans.plans?.find(
    (p) => p.name === PLAN_NAME && p.status === "ACTIVE",
  );
  if (existing) {
    console.log(`Reusing plan ${existing.id}`);
    console.log(`PAYPAL_PLAN_ID=${existing.id}`);
    return;
  }

  const plan = await api<{ id: string }>(t, "/v1/billing/plans", {
    product_id: productId,
    name: PLAN_NAME,
    status: "ACTIVE",
    billing_cycles: [
      {
        frequency: { interval_unit: "DAY", interval_count: TRIAL_DAYS },
        tenure_type: "TRIAL",
        sequence: 1,
        total_cycles: 1,
        pricing_scheme: {
          fixed_price: { value: "0", currency_code: CURRENCY },
        },
      },
      {
        frequency: { interval_unit: "MONTH", interval_count: 1 },
        tenure_type: "REGULAR",
        sequence: 2,
        total_cycles: 0,
        pricing_scheme: {
          fixed_price: { value: PRICE, currency_code: CURRENCY },
        },
      },
    ],
    payment_preferences: {
      auto_bill_outstanding: true,
      setup_fee_failure_action: "CONTINUE",
      payment_failure_threshold: 3,
    },
  });

  console.log(`Created plan ${plan.id}`);
  console.log(`PAYPAL_PLAN_ID=${plan.id}`);
}

main().catch((err) => {
  console.error("seed-paypal-plan failed:", err);
  process.exit(1);
});

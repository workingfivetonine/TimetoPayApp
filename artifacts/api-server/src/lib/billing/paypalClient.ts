import type { EntitlementStatus } from "./entitlement";

// PayPal REST client (Subscriptions API). PayPal is not a Replit connector, so
// credentials come from environment secrets:
//   PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET  — REST app credentials
//   PAYPAL_WEBHOOK_ID                        — id of the configured webhook (for verification)
//   PAYPAL_API_BASE                          — API host (defaults to sandbox)
//   PAYPAL_PLAN_ID                           — billing plan to subscribe users to (set by the seed script)

function apiBase(): string {
  return (
    process.env.PAYPAL_API_BASE?.replace(/\/+$/, "") ||
    "https://api-m.sandbox.paypal.com"
  );
}

export function isPaypalConfigured(): boolean {
  return Boolean(
    process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET,
  );
}

// True for sandbox hosts — used to pick the right consumer-facing manage URL.
export function isPaypalSandbox(): boolean {
  return apiBase().includes("sandbox");
}

let tokenCache: { token: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  const now = Date.now();
  if (tokenCache && tokenCache.expiresAt > now + 60_000) return tokenCache.token;

  const id = process.env.PAYPAL_CLIENT_ID;
  const secret = process.env.PAYPAL_CLIENT_SECRET;
  if (!id || !secret) {
    throw new Error(
      "PayPal not configured: PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET are missing.",
    );
  }

  const auth = Buffer.from(`${id}:${secret}`).toString("base64");
  const resp = await fetch(`${apiBase()}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
    signal: AbortSignal.timeout(10_000),
  });

  if (!resp.ok) {
    throw new Error(`PayPal token request failed: ${resp.status} ${await resp.text()}`);
  }

  const data = (await resp.json()) as { access_token: string; expires_in: number };
  tokenCache = { token: data.access_token, expiresAt: now + data.expires_in * 1000 };
  return data.access_token;
}

async function paypalFetch<T = unknown>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const token = await getAccessToken();
  const resp = await fetch(`${apiBase()}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
    signal: init.signal ?? AbortSignal.timeout(15_000),
  });

  const text = await resp.text();
  const json = text ? JSON.parse(text) : null;
  if (!resp.ok) {
    throw new Error(`PayPal API ${path} failed: ${resp.status} ${text}`);
  }
  return json as T;
}

export interface PaypalSubscription {
  id: string;
  status: string;
  custom_id?: string;
  plan_id?: string;
  billing_info?: { next_billing_time?: string };
}

export async function getPaypalSubscription(
  id: string,
): Promise<PaypalSubscription> {
  return paypalFetch<PaypalSubscription>(`/v1/billing/subscriptions/${id}`);
}

export async function createPaypalSubscription(opts: {
  planId: string;
  userId: string;
  returnUrl: string;
  cancelUrl: string;
}): Promise<{ id: string; approveUrl: string | null }> {
  const sub = await paypalFetch<{
    id: string;
    links?: Array<{ rel: string; href: string }>;
  }>(`/v1/billing/subscriptions`, {
    method: "POST",
    body: JSON.stringify({
      plan_id: opts.planId,
      // custom_id ties the PayPal subscription back to our user so webhooks and
      // finalize can authoritatively resolve the owner.
      custom_id: opts.userId,
      application_context: {
        brand_name: "TimetoPay",
        user_action: "SUBSCRIBE_NOW",
        shipping_preference: "NO_SHIPPING",
        return_url: opts.returnUrl,
        cancel_url: opts.cancelUrl,
      },
    }),
  });
  const approveUrl = sub.links?.find((l) => l.rel === "approve")?.href ?? null;
  return { id: sub.id, approveUrl };
}

export async function cancelPaypalSubscription(
  id: string,
  reason = "Cancelled by user",
): Promise<void> {
  await paypalFetch(`/v1/billing/subscriptions/${id}/cancel`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}

export function mapPaypalStatus(s: string | undefined): EntitlementStatus {
  switch ((s ?? "").toUpperCase()) {
    case "ACTIVE":
      // PayPal reports ACTIVE during the trial too; entitlement-wise that's fine.
      return "active";
    case "SUSPENDED":
      return "past_due";
    case "CANCELLED":
    case "EXPIRED":
      return "canceled";
    case "APPROVAL_PENDING":
    case "APPROVED":
    default:
      return "none";
  }
}

// Verifies a PayPal webhook signature server-side via PayPal's verification API.
// `event` must be the parsed JSON body exactly as received.
export async function verifyPaypalWebhook(
  headers: Record<string, string | undefined>,
  event: unknown,
): Promise<boolean> {
  const webhookId = process.env.PAYPAL_WEBHOOK_ID;
  if (!webhookId) return false;

  const result = await paypalFetch<{ verification_status: string }>(
    `/v1/notifications/verify-webhook-signature`,
    {
      method: "POST",
      body: JSON.stringify({
        auth_algo: headers["paypal-auth-algo"],
        cert_url: headers["paypal-cert-url"],
        transmission_id: headers["paypal-transmission-id"],
        transmission_sig: headers["paypal-transmission-sig"],
        transmission_time: headers["paypal-transmission-time"],
        webhook_id: webhookId,
        webhook_event: event,
      }),
    },
  );
  return result.verification_status === "SUCCESS";
}

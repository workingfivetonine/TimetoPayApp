// Resend integration (Replit connector: "resend").
//
// Sends transactional reminder emails through Resend's `POST /emails` API. Unlike
// the previous SendGrid setup, Resend has no "dynamic template id" concept — the
// email subject and HTML body are rendered in code (see `templates.ts`) and sent
// directly, so email design lives in version control rather than a dashboard.
//
// The Replit Connectors SDK injects the Resend API key automatically via its
// proxy, so no API key is hand-managed here. Always construct a FRESH client per
// send (do not cache) so credentials stay valid in a long-lived process.
//
// Graceful no-op: if Resend isn't connected or the sender email isn't configured,
// the send is skipped (with a logged warning) and the app keeps running — nothing
// is ever thrown to the scheduler.
import { ReplitConnectors } from "@replit/connectors-sdk";
import { logger } from "../logger";

const RESEND_CONNECTOR = "resend";

// The verified Resend sender. Required for any send (Resend rejects an
// unverified/empty from address), so a missing value means "not configured".
function fromEmail(): string | null {
  return process.env.RESEND_FROM_EMAIL?.trim() || null;
}

function fromName(): string {
  return process.env.RESEND_FROM_NAME?.trim() || "Receipt Tracker";
}

// Resend expects the from field as `Name <email@domain>` (or a bare address).
function fromHeader(sender: string): string {
  const name = fromName();
  return name ? `${name} <${sender}>` : sender;
}

// Resend is "configured enough to attempt a send" when the connector proxy is
// reachable (REPLIT_CONNECTORS_HOSTNAME is injected by Replit when at least one
// connector is bound) and a verified sender address is set. Whether the specific
// connection is actually authorized is discovered at send time (a failed proxy
// call is caught and treated as a no-op).
export function isResendConfigured(): boolean {
  return !!process.env.REPLIT_CONNECTORS_HOSTNAME && !!fromEmail();
}

export interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface SendResult {
  sent: boolean;
  reason?: "not-configured" | "send-failed";
}

// Send one email through Resend. Returns { sent: false, reason: "not-configured" }
// on a graceful skip; returns { sent: false, reason: "send-failed" } if the Resend
// API rejects the request (logged, never thrown).
export async function sendEmail(params: SendEmailParams): Promise<SendResult> {
  const sender = fromEmail();
  if (!isResendConfigured() || !sender) {
    logger.warn(
      "Resend not configured (missing connector binding or RESEND_FROM_EMAIL) — skipping email send",
    );
    return { sent: false, reason: "not-configured" };
  }

  const body = {
    from: fromHeader(sender),
    to: [params.to],
    subject: params.subject,
    html: params.html,
    text: params.text,
  };

  try {
    // Resend connector via Replit Connectors SDK proxy.
    const connectors = new ReplitConnectors();
    const res = await connectors.proxy(RESEND_CONNECTOR, "/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      logger.error(
        { status: res.status, detail: detail.slice(0, 500) },
        "Resend send failed",
      );
      return { sent: false, reason: "send-failed" };
    }
    return { sent: true };
  } catch (err) {
    logger.error({ err }, "Resend send threw");
    return { sent: false, reason: "send-failed" };
  }
}

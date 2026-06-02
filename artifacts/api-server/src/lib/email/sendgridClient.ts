// SendGrid integration (Replit connector: "sendgrid").
//
// Sends transactional reminder emails through SendGrid Dynamic Templates: the
// app only supplies a template id + the dynamic data, and the visual design is
// edited in the SendGrid dashboard (drag-and-drop) without code changes.
//
// The Replit Connectors SDK injects the SendGrid API key automatically via its
// proxy, so no API key is hand-managed here. Always construct a FRESH client per
// send (do not cache) so credentials stay valid in a long-lived process.
//
// Graceful no-op: if SendGrid isn't connected, the sender email isn't
// configured, or a template id is missing, the send is skipped (with a logged
// warning) and the app keeps running — nothing is ever thrown to the scheduler.
import { ReplitConnectors } from "@replit/connectors-sdk";
import { logger } from "../logger";

const SENDGRID_CONNECTOR = "sendgrid";

// The verified SendGrid sender. Required for any send (SendGrid rejects an
// unverified/empty from address), so a missing value means "not configured".
function fromEmail(): string | null {
  return process.env.SENDGRID_FROM_EMAIL?.trim() || null;
}

function fromName(): string {
  return process.env.SENDGRID_FROM_NAME?.trim() || "Receipt Tracker";
}

// SendGrid is "configured enough to attempt a send" when the connector proxy is
// reachable (REPLIT_CONNECTORS_HOSTNAME is injected by Replit when at least one
// connector is bound) and a verified sender address is set. Whether the specific
// connection is actually authorized is discovered at send time (a failed proxy
// call is caught and treated as a no-op).
export function isSendgridConfigured(): boolean {
  return !!process.env.REPLIT_CONNECTORS_HOSTNAME && !!fromEmail();
}

export interface SendTemplateParams {
  to: string;
  templateId: string | undefined | null;
  // Named variables the SendGrid Dynamic Template consumes (Handlebars).
  dynamicData: Record<string, unknown>;
}

export interface SendResult {
  sent: boolean;
  reason?: "not-configured" | "no-template" | "send-failed";
}

// Send one SendGrid Dynamic Template email. Returns { sent: false, reason } on a
// graceful skip; returns { sent: false, reason: "send-failed" } if the SendGrid
// API rejects the request (logged, never thrown).
export async function sendDynamicTemplate(
  params: SendTemplateParams,
): Promise<SendResult> {
  const sender = fromEmail();
  if (!isSendgridConfigured() || !sender) {
    logger.warn(
      "SendGrid not configured (missing connector binding or SENDGRID_FROM_EMAIL) — skipping email send",
    );
    return { sent: false, reason: "not-configured" };
  }
  const templateId = params.templateId?.trim();
  if (!templateId) {
    logger.warn(
      "SendGrid template id not configured for this email type — skipping send",
    );
    return { sent: false, reason: "no-template" };
  }

  const body = {
    from: { email: sender, name: fromName() },
    personalizations: [
      {
        to: [{ email: params.to }],
        dynamic_template_data: params.dynamicData,
      },
    ],
    template_id: templateId,
  };

  try {
    const connectors = new ReplitConnectors();
    const res = await connectors.proxy(SENDGRID_CONNECTOR, "/v3/mail/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      logger.error(
        { status: res.status, detail: detail.slice(0, 500) },
        "SendGrid send failed",
      );
      return { sent: false, reason: "send-failed" };
    }
    return { sent: true };
  } catch (err) {
    logger.error({ err }, "SendGrid send threw");
    return { sent: false, reason: "send-failed" };
  }
}

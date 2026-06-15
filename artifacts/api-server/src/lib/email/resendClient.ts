// Resend integration.
//
// Sends transactional emails through Resend's POST /emails API.
// Reads credentials from environment variables (set in Railway Variables tab).
// Required env vars:
//   RESEND_API_KEY     — your Resend API key (from resend.com → API Keys)
//   RESEND_FROM_EMAIL  — verified sender address (e.g. noreply@5to9shopping.com)
//   RESEND_FROM_NAME   — sender display name (e.g. "Receipt Tracker")

import { logger } from "../logger";

function fromEmail(): string | null {
  return process.env.RESEND_FROM_EMAIL?.trim() || null;
}

function fromName(): string {
  return process.env.RESEND_FROM_NAME?.trim() || "TimetoPay";
}

function fromHeader(sender: string): string {
  const name = fromName();
  return name ? `${name} <${sender}>` : sender;
}

export function isResendConfigured(): boolean {
  return !!process.env.RESEND_API_KEY && !!fromEmail();
}

export interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
  text: string;
  // When set, adds RFC 8058 one-click unsubscribe headers so Gmail/Yahoo show a
  // native "Unsubscribe" control and bulk-sender requirements are met. Only the
  // promotional reminder emails pass this; transactional mail omits it.
  unsubscribeUrl?: string;
}

export interface SendTemplateParams {
  to: string;
  templateId: string;
  variables: Record<string, string>;
}

export interface SendResult {
  sent: boolean;
  reason?: "not-configured" | "send-failed";
}

export async function sendEmailWithTemplate(params: SendTemplateParams): Promise<SendResult> {
  const sender = fromEmail();
  if (!isResendConfigured() || !sender) {
    logger.warn(
      "Resend not configured (missing RESEND_API_KEY or RESEND_FROM_EMAIL) — skipping template email send",
    );
    return { sent: false, reason: "not-configured" };
  }

  const body = {
    from: fromHeader(sender),
    to: [params.to],
    template: {
      id: params.templateId,
      variables: params.variables,
    },
  };

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.RESEND_API_KEY}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      logger.error(
        { status: res.status, detail: detail.slice(0, 500) },
        "Resend template send failed",
      );
      return { sent: false, reason: "send-failed" };
    }

    return { sent: true };
  } catch (err) {
    logger.error({ err }, "Resend template send threw");
    return { sent: false, reason: "send-failed" };
  }
}

export async function sendEmail(params: SendEmailParams): Promise<SendResult> {
  const sender = fromEmail();
  if (!isResendConfigured() || !sender) {
    logger.warn(
      "Resend not configured (missing RESEND_API_KEY or RESEND_FROM_EMAIL) — skipping email send",
    );
    return { sent: false, reason: "not-configured" };
  }

  const body: Record<string, unknown> = {
    from: fromHeader(sender),
    to: [params.to],
    subject: params.subject,
    html: params.html,
    text: params.text,
  };
  if (params.unsubscribeUrl) {
    body.headers = {
      "List-Unsubscribe": `<${params.unsubscribeUrl}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    };
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.RESEND_API_KEY}`,
      },
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

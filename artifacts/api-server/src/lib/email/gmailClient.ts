// Gmail admin digest — now sent via Resend instead of the Gmail connector.
//
// The original implementation used Replit's Google OAuth connector.
// Outside Replit, the simplest replacement is Resend, which is already
// configured for transactional email in this app.
//
// Required env vars (same as resendClient.ts):
//   RESEND_API_KEY     — your Resend API key
//   RESEND_FROM_EMAIL  — verified sender (e.g. noreply@fivetoninesolutions.com)
//   RESEND_FROM_NAME   — sender display name
//   ADMIN_EMAIL        — where to send the digest (your Gmail address)

import { logger } from "../logger";

export interface SendEmailParams {
  to: string;
  subject: string;
  text: string;
  html: string;
}

// Kept for backwards compatibility — callers that used getUncachableGmailClient()
// can be updated later; this stub keeps the app from crashing in the meantime.
export function getUncachableGmailClient(): null {
  return null;
}

export async function sendGmail(params: SendEmailParams): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL?.trim();
  const fromName = process.env.RESEND_FROM_NAME?.trim() || "Receipt Tracker";

  if (!apiKey || !fromEmail) {
    logger.warn(
      "Resend not configured (missing RESEND_API_KEY or RESEND_FROM_EMAIL) — skipping admin digest",
    );
    return;
  }

  const from = fromName ? `${fromName} <${fromEmail}>` : fromEmail;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      from,
      to: [params.to],
      subject: params.subject,
      html: params.html,
      text: params.text,
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(
      `Admin digest send failed: ${res.status} ${detail.slice(0, 500)}`,
    );
  }
}

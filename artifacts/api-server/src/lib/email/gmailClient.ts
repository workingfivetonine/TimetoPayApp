// Gmail integration (Replit connector: "google-mail").
//
// Sends transactional admin-digest emails through the connected Google account.
// The Replit Connectors SDK injects the OAuth2 access token and refreshes it
// automatically. Always construct a FRESH client per use (do not cache the
// instance) so long-lived processes keep getting valid, refreshed tokens.
import { ReplitConnectors } from "@replit/connectors-sdk";

export function getUncachableGmailClient(): ReplitConnectors {
  return new ReplitConnectors();
}

export interface SendEmailParams {
  to: string;
  subject: string;
  text: string;
  html: string;
}

// Base64url with padding stripped (Gmail's expected `raw` encoding).
function toBase64Url(input: string): string {
  return Buffer.from(input, "utf-8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

// RFC 2047 encoded-word so non-ASCII subjects survive transit.
function encodeSubject(subject: string): string {
  if (/^[\x20-\x7e]*$/.test(subject)) return subject;
  return `=?UTF-8?B?${Buffer.from(subject, "utf-8").toString("base64")}?=`;
}

// Base64-encode a UTF-8 body, wrapped to 76-char lines (RFC 2045) so non-ASCII
// content (item/store/user names) is transferred losslessly under CTE: base64.
function base64Body(body: string): string {
  const b64 = Buffer.from(body, "utf-8").toString("base64");
  return (b64.match(/.{1,76}/g) ?? [b64]).join("\r\n");
}

function buildRawMessage({ to, subject, text, html }: SendEmailParams): string {
  const boundary = `b_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
  const lines = [
    `To: ${to}`,
    `Subject: ${encodeSubject(subject)}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    base64Body(text),
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    base64Body(html),
    `--${boundary}--`,
    "",
  ];
  return lines.join("\r\n");
}

// Sends an email via the Gmail connector proxy. Throws on a non-2xx response so
// callers can log/skip; never silently swallows a failed send.
export async function sendGmail(params: SendEmailParams): Promise<void> {
  const connectors = getUncachableGmailClient();
  const raw = toBase64Url(buildRawMessage(params));
  const res = await connectors.proxy(
    "google-mail",
    "/gmail/v1/users/me/messages/send",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ raw }),
    },
  );
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Gmail send failed: ${res.status} ${detail.slice(0, 500)}`);
  }
}

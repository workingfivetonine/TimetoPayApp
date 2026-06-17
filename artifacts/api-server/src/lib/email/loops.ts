// Loops (loops.so) integration.
//
// When LOOPS_API_KEY is set, the app's lifecycle emails are sent to Loops as
// EVENTS — you design the actual email + any follow-up automation in the Loops
// dashboard, triggered by the event name. Each user is also upserted as a
// CONTACT with properties (name, plan, status…) so audiences and automations
// can personalize and segment. Loops is the ONLY email provider — Resend has
// been removed. When LOOPS_API_KEY is absent, sends are a graceful no-op
// (logged), so the app never crashes during setup.
//
// Required env var (set in Railway):
//   LOOPS_API_KEY — from app.loops.so → Settings → API
//
// Event names fired (build a matching email/automation in Loops for each):
//   welcome, subscription_started, account_deleted, trial_ending,
//   payment_past_due, list_export_ready, receipt_inactivity,
//   weekly_summary, monthly_summary
import { logger } from "../logger";

export interface SendResult {
  sent: boolean;
  reason?: "not-configured" | "send-failed";
}

const LOOPS_BASE = "https://app.loops.so/api/v1";

type LoopsValue = string | number | boolean | null;

export function isLoopsConfigured(): boolean {
  return !!process.env.LOOPS_API_KEY?.trim();
}

function authHeaders(): Record<string, string> {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${process.env.LOOPS_API_KEY!.trim()}`,
  };
}

// Create or update a contact. Loops' /contacts/update upserts (creates when the
// contact doesn't exist), so this is safe to call repeatedly to keep properties
// fresh. Never throws — email is best-effort.
export async function loopsUpsertContact(
  email: string,
  properties: Record<string, LoopsValue> = {},
): Promise<SendResult> {
  if (!isLoopsConfigured()) return { sent: false, reason: "not-configured" };
  try {
    const res = await fetch(`${LOOPS_BASE}/contacts/update`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ email, ...properties }),
    });
    if (!res.ok) {
      logger.error({ status: res.status }, "Loops contact upsert failed");
      return { sent: false, reason: "send-failed" };
    }
    return { sent: true };
  } catch (err) {
    logger.error({ err }, "Loops contact upsert error");
    return { sent: false, reason: "send-failed" };
  }
}

// Send a one-off transactional email defined in Loops (create it in the
// dashboard, copy its Transactional ID). Used for team-bound mail that isn't a
// user lifecycle event — the support contact form and the admin digest — so
// they don't depend on Resend. `transactionalId` comes from an env var; when
// it's unset this is a logged no-op.
export async function loopsSendTransactional(
  email: string,
  transactionalId: string | undefined,
  dataVariables: Record<string, LoopsValue> = {},
): Promise<SendResult> {
  if (!isLoopsConfigured() || !transactionalId) {
    return { sent: false, reason: "not-configured" };
  }
  try {
    const res = await fetch(`${LOOPS_BASE}/transactional`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ email, transactionalId, dataVariables }),
    });
    if (!res.ok) {
      logger.error({ status: res.status, transactionalId }, "Loops transactional failed");
      return { sent: false, reason: "send-failed" };
    }
    return { sent: true };
  } catch (err) {
    logger.error({ err, transactionalId }, "Loops transactional error");
    return { sent: false, reason: "send-failed" };
  }
}

// Fire an event for a contact. In Loops you attach an email/automation to the
// event name; eventProperties + contactProperties are available as merge data.
// Upserts the contact (with any contactProperties) as a side effect.
export async function loopsSendEvent(
  email: string,
  eventName: string,
  opts: {
    eventProperties?: Record<string, LoopsValue>;
    contactProperties?: Record<string, LoopsValue>;
  } = {},
): Promise<SendResult> {
  if (!isLoopsConfigured()) return { sent: false, reason: "not-configured" };
  try {
    const res = await fetch(`${LOOPS_BASE}/events/send`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        email,
        eventName,
        ...(opts.eventProperties ? { eventProperties: opts.eventProperties } : {}),
        ...(opts.contactProperties ? { contactProperties: opts.contactProperties } : {}),
      }),
    });
    if (!res.ok) {
      logger.error({ status: res.status, eventName }, "Loops event failed");
      return { sent: false, reason: "send-failed" };
    }
    return { sent: true };
  } catch (err) {
    logger.error({ err, eventName }, "Loops event error");
    return { sent: false, reason: "send-failed" };
  }
}

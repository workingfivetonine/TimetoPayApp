// One-time utility: creates or updates all TimetoPay email templates in Resend
// via the Templates API. Called from the admin route GET /admin/seed-resend-templates.
// Remove that route (and this file) once the env vars are set in Railway.

const RESEND_API = "https://api.resend.com";

const TEAL = "#0d9488";
const TEAL_DARK = "#0f766e";
const INK = "#1f2937";
const MUTED = "#6b7280";
const BG = "#f3f4f6";
const CARD = "#ffffff";
const BRAND = "TimetoPay";

function p(content: string): string {
  return `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:${INK};">${content}</p>`;
}

function statCard(label: string, value: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 18px;"><tr><td style="background:${BG};border-radius:10px;padding:16px 18px;"><div style="font-size:12px;text-transform:uppercase;letter-spacing:0.5px;color:${MUTED};margin-bottom:4px;">${label}</div><div style="font-size:26px;font-weight:700;color:${TEAL_DARK};">${value}</div></td></tr></table>`;
}

function layout(heading: string, bodyHtml: string): string {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/></head><body style="margin:0;padding:0;background:${BG};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${INK};"><div style="display:none;max-height:0;overflow:hidden;opacity:0;">{{{SUBJECT}}}</div><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BG};padding:24px 12px;"><tr><td align="center"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:${CARD};border-radius:14px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);"><tr><td style="background:${TEAL};padding:20px 28px;"><span style="color:#fff;font-size:18px;font-weight:700;letter-spacing:0.2px;">${BRAND}</span></td></tr><tr><td style="padding:28px;"><h1 style="margin:0 0 16px;font-size:21px;line-height:1.3;color:${INK};">${heading}</h1>${bodyHtml}</td></tr><tr><td style="padding:18px 28px;border-top:1px solid #e5e7eb;"><p style="margin:0;font-size:12px;color:${MUTED};line-height:1.6;">You're receiving this because you have ${BRAND} reminders turned on. You can change which emails you get from the app's notification settings.</p></td></tr></table></td></tr></table></body></html>`;
}

interface TemplateDef {
  envVar: string;
  name: string;
  subject: string;
  html: string;
  text: string;
}

function buildTemplates(): TemplateDef[] {
  return [
    {
      envVar: "RESEND_TEMPLATE_TRIAL_ENDING",
      name: `${BRAND} — Trial Ending`,
      subject: "{{{SUBJECT}}}",
      html: layout("Hi {{{NAME}}}, your trial is almost up", [
        p("Your TimetoPay free trial {{{DAYS_LEFT_PHRASE}}}{{{ENDS_DATE}}}."),
        p("Subscribe to keep AI receipt scanning, the cross-user price catalog, and per-item price history. No pressure — your saved receipts stay put either way."),
      ].join("")),
      text: "Hi {{{NAME}}}, your TimetoPay free trial {{{DAYS_LEFT_PHRASE}}}{{{ENDS_DATE}}}. Subscribe to keep premium features.",
    },
    {
      envVar: "RESEND_TEMPLATE_PAST_DUE",
      name: `${BRAND} — Payment Past Due`,
      subject: "{{{SUBJECT}}}",
      html: layout("Hi {{{NAME}}}, there's a problem with your payment", [
        p("Your most recent TimetoPay subscription payment didn't go through.{{{ACCESS_UNTIL}}}"),
        p("Please update your payment method from the app's subscription settings to avoid losing premium features."),
      ].join("")),
      text: "Hi {{{NAME}}}, your most recent TimetoPay payment didn't go through.{{{ACCESS_UNTIL}}} Update your payment method in subscription settings.",
    },
    {
      envVar: "RESEND_TEMPLATE_LIST_EXPORT",
      name: `${BRAND} — Shopping List Nudge`,
      subject: "{{{SUBJECT}}}",
      html: layout("Hi {{{NAME}}}, heading to the store soon?", [
        statCard("On your shopping list", "{{{ITEM_COUNT}}}"),
        p("Open the app to export a printable list grouped by store, with the lowest known price for each item so you shop smart."),
      ].join("")),
      text: "Hi {{{NAME}}}, you have {{{ITEM_COUNT}}} on your shopping list. Open TimetoPay to export a printable, store-grouped list.",
    },
    {
      envVar: "RESEND_TEMPLATE_RECEIPT_INACTIVITY",
      name: `${BRAND} — Receipt Inactivity`,
      subject: "{{{SUBJECT}}}",
      html: layout("{{{HEADLINE}}}", [
        p("{{{BODY}}}"),
        `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:${INK};display:{{{STAPLE_DISPLAY}}};">Also — when did you last restock <strong>{{{STAPLE_ITEM}}}</strong>? Just saying.</p>`,
        p("Snap your next receipt to keep your prices and spending up to date."),
      ].join("")),
      text: "{{{HEADLINE}}}\n\n{{{BODY}}}",
    },
    {
      envVar: "RESEND_TEMPLATE_WEEKLY_SUMMARY",
      name: `${BRAND} — Weekly Spend Summary`,
      subject: "{{{SUBJECT}}}",
      html: layout("Hi {{{NAME}}}, here's your weekly recap", [
        p("Spending from <strong>{{{PERIOD_START}}}</strong> to <strong>{{{PERIOD_END}}}</strong>:"),
        statCard("Total this week", "{{{TOTAL}}}"),
        `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:${INK};display:{{{IS_FLAT}}};">That's right in line with the previous week.</p>`,
        `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:${INK};display:{{{IS_CHANGE}}};">That's <strong>{{{CHANGE_AMOUNT}}} {{{CHANGE_DIRECTION}}}</strong> than the previous week ({{{PREVIOUS_TOTAL}}}).</p>`,
      ].join("")),
      text: "Hi {{{NAME}}}, your weekly TimetoPay recap ({{{PERIOD_START}}} to {{{PERIOD_END}}}): {{{TOTAL}}}. {{{CHANGE_LINE_TEXT}}}",
    },
    {
      envVar: "RESEND_TEMPLATE_MONTHLY_SUMMARY",
      name: `${BRAND} — Monthly Spend Summary`,
      subject: "{{{SUBJECT}}}",
      html: layout("Hi {{{NAME}}}, here's your monthly recap", [
        p("Spending from <strong>{{{PERIOD_START}}}</strong> to <strong>{{{PERIOD_END}}}</strong>:"),
        statCard("Total this month", "{{{TOTAL}}}"),
        `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:${INK};display:{{{IS_FLAT}}};">That's right in line with the previous month.</p>`,
        `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:${INK};display:{{{IS_CHANGE}}};">That's <strong>{{{CHANGE_AMOUNT}}} {{{CHANGE_DIRECTION}}}</strong> than the previous month ({{{PREVIOUS_TOTAL}}}).</p>`,
      ].join("")),
      text: "Hi {{{NAME}}}, your monthly TimetoPay recap ({{{PERIOD_START}}} to {{{PERIOD_END}}}): {{{TOTAL}}}. {{{CHANGE_LINE_TEXT}}}",
    },
  ];
}

async function listExisting(key: string): Promise<Array<{ id: string; name: string }>> {
  const res = await fetch(`${RESEND_API}/templates`, {
    headers: { Authorization: `Bearer ${key}` },
  });
  if (!res.ok) throw new Error(`GET /templates: ${res.status}`);
  const data = (await res.json()) as { data?: Array<{ id: string; name: string }> };
  return data.data ?? [];
}

async function createTemplate(key: string, tmpl: TemplateDef): Promise<string> {
  const res = await fetch(`${RESEND_API}/templates`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ name: tmpl.name, subject: tmpl.subject, html: tmpl.html, text: tmpl.text }),
  });
  if (!res.ok) throw new Error(`POST /templates: ${res.status} — ${await res.text()}`);
  return ((await res.json()) as { id: string }).id;
}

async function updateTemplate(key: string, id: string, tmpl: TemplateDef): Promise<void> {
  const res = await fetch(`${RESEND_API}/templates/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ name: tmpl.name, subject: tmpl.subject, html: tmpl.html, text: tmpl.text }),
  });
  if (!res.ok) throw new Error(`PATCH /templates/${id}: ${res.status} — ${await res.text()}`);
}

export interface SeedResult {
  envVars: Record<string, string>;
  created: string[];
  updated: string[];
}

export async function seedResendTemplates(): Promise<SeedResult> {
  const key = process.env.RESEND_API_KEY?.trim();
  if (!key) throw new Error("RESEND_API_KEY is not set");

  const existing = await listExisting(key);
  const byName = new Map(existing.map((t) => [t.name, t.id]));
  const templates = buildTemplates();

  const result: SeedResult = { envVars: {}, created: [], updated: [] };

  for (const tmpl of templates) {
    const existingId = byName.get(tmpl.name);
    if (existingId) {
      await updateTemplate(key, existingId, tmpl);
      result.envVars[tmpl.envVar] = existingId;
      result.updated.push(tmpl.name);
    } else {
      const newId = await createTemplate(key, tmpl);
      result.envVars[tmpl.envVar] = newId;
      result.created.push(tmpl.name);
    }
  }

  return result;
}

// Code-rendered email templates for Resend.
//
// Resend has no SendGrid-style "dynamic template id" — every email's subject and
// HTML body is built here from the reminder data. Each render function returns a
// { subject, html, text } triple consumed by `sendEmail` in `resendClient.ts`.
//
// Keep the data each function accepts in sync with the call sites in
// `lib/notifications/reminders.ts`.
import type { PeriodComparison } from "../analytics/spend";

const BRAND = "TimetoPay";
const TEAL = "#0d9488";
const TEAL_DARK = "#0f766e";
const INK = "#1f2937";
const MUTED = "#6b7280";
const BG = "#f3f4f6";
const CARD = "#ffffff";

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Resolve a greeting name with a friendly fallback (the email's display name can
// be null when we can't derive one). The `Html` variant is escape-safe.
function greetName(name: string | null): string {
  return name?.trim() || "there";
}
function greetNameHtml(name: string | null): string {
  return escapeHtml(greetName(name));
}

function formatMoney(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

function formatDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

// Shared responsive layout. `bodyHtml` is trusted, pre-escaped markup; dynamic
// values passed into it must be escaped by the caller.
function layout(opts: {
  heading: string;
  bodyHtml: string;
  preview?: string;
}): string {
  const preview = opts.preview
    ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(
        opts.preview,
      )}</div>`
    : "";
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
</head>
<body style="margin:0;padding:0;background:${BG};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${INK};">
${preview}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BG};padding:24px 12px;">
  <tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:${CARD};border-radius:14px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
      <tr><td style="background:${TEAL};padding:20px 28px;">
        <span style="color:#ffffff;font-size:18px;font-weight:700;letter-spacing:0.2px;">${BRAND}</span>
      </td></tr>
      <tr><td style="padding:28px;">
        <h1 style="margin:0 0 16px;font-size:21px;line-height:1.3;color:${INK};">${escapeHtml(
          opts.heading,
        )}</h1>
        ${opts.bodyHtml}
      </td></tr>
      <tr><td style="padding:18px 28px;border-top:1px solid #e5e7eb;">
        <p style="margin:0;font-size:12px;color:${MUTED};line-height:1.6;">
          You're receiving this because you have ${BRAND} reminders turned on. You can change which emails you get from the app's notification settings.
        </p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;
}

function paragraph(text: string): string {
  return `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:${INK};">${text}</p>`;
}

function statCard(label: string, value: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 18px;">
    <tr><td style="background:${BG};border-radius:10px;padding:16px 18px;">
      <div style="font-size:12px;text-transform:uppercase;letter-spacing:0.5px;color:${MUTED};margin-bottom:4px;">${escapeHtml(
        label,
      )}</div>
      <div style="font-size:26px;font-weight:700;color:${TEAL_DARK};">${escapeHtml(
        value,
      )}</div>
    </td></tr>
  </table>`;
}

// ── Trial ending ────────────────────────────────────────────────────────────
export function renderTrialEnding(data: {
  name: string | null;
  daysLeft: number;
  trialEndsAt: string;
}): RenderedEmail {
  const name = greetNameHtml(data.name);
  const ends = formatDate(data.trialEndsAt);
  const dayWord = data.daysLeft === 1 ? "day" : "days";
  const subject =
    data.daysLeft <= 0
      ? "Your free trial ends today"
      : `Your free trial ends in ${data.daysLeft} ${dayWord}`;
  const html = layout({
    heading: `Hi ${name}, your trial is almost up`,
    preview: subject,
    bodyHtml: `
      ${paragraph(
        `Your ${BRAND} free trial ${
          data.daysLeft <= 0
            ? "ends today"
            : `ends in <strong>${data.daysLeft} ${dayWord}</strong>`
        }${ends ? ` (on ${escapeHtml(ends)})` : ""}.`,
      )}
      ${paragraph(
        "Subscribe to keep AI receipt scanning, the cross-user price catalog, and per-item price history. No pressure — your saved receipts stay put either way.",
      )}
    `,
  });
  const text = `Hi ${greetName(data.name)}, your ${BRAND} free trial ${
    data.daysLeft <= 0 ? "ends today" : `ends in ${data.daysLeft} ${dayWord}`
  }${ends ? ` (on ${ends})` : ""}. Subscribe to keep premium features.`;
  return { subject, html, text };
}

// ── Payment past due ──────────────────────────────────────────────────────────
export function renderPastDue(data: {
  name: string | null;
  currentPeriodEnd: string | null;
}): RenderedEmail {
  const name = greetNameHtml(data.name);
  const until = formatDate(data.currentPeriodEnd);
  const subject = "We couldn't process your payment";
  const html = layout({
    heading: `Hi ${name}, there's a problem with your payment`,
    preview: subject,
    bodyHtml: `
      ${paragraph(
        `Your most recent ${BRAND} subscription payment didn't go through.${
          until
            ? ` Your access continues until <strong>${escapeHtml(
                until,
              )}</strong>.`
            : ""
        }`,
      )}
      ${paragraph(
        "Please update your payment method from the app's subscription settings to avoid losing premium features.",
      )}
    `,
  });
  const text = `Hi ${greetName(data.name)}, your most recent ${BRAND} payment didn't go through.${
    until ? ` Access continues until ${until}.` : ""
  } Update your payment method in subscription settings.`;
  return { subject, html, text };
}

// ── Weekly grocery-list export nudge ──────────────────────────────────────────
export function renderListExport(data: {
  name: string | null;
  itemCount: number;
}): RenderedEmail {
  const name = greetNameHtml(data.name);
  const itemWord = data.itemCount === 1 ? "item" : "items";
  const subject = `Your shopping list has ${data.itemCount} ${itemWord} ready`;
  const html = layout({
    heading: `Hi ${name}, heading to the store soon?`,
    preview: subject,
    bodyHtml: `
      ${statCard("On your shopping list", `${data.itemCount} ${itemWord}`)}
      ${paragraph(
        "Open the app to export a printable list grouped by store, with the lowest known price for each item so you shop smart.",
      )}
    `,
  });
  const text = `Hi ${greetName(data.name)}, you have ${data.itemCount} ${itemWord} on your shopping list. Open ${BRAND} to export a printable, store-grouped list.`;
  return { subject, html, text };
}

// ── Receipt-upload inactivity nudge (snarky) ──────────────────────────────────
export function renderReceiptInactivity(data: {
  name: string | null;
  daysSinceLastReceipt: number | null;
  headline: string;
  body: string;
  neglectedStaple: string | null;
}): RenderedEmail {
  const subject = data.headline;
  const stapleLine = data.neglectedStaple
    ? paragraph(
        `Also — when did you last restock <strong>${escapeHtml(
          data.neglectedStaple,
        )}</strong>? Just saying.`,
      )
    : "";
  const html = layout({
    heading: data.headline,
    preview: data.body,
    bodyHtml: `
      ${paragraph(escapeHtml(data.body))}
      ${stapleLine}
      ${paragraph("Snap your next receipt to keep your prices and spending up to date.")}
    `,
  });
  const text = `${data.headline}\n\n${data.body}${
    data.neglectedStaple
      ? `\n\nWhen did you last restock ${data.neglectedStaple}?`
      : ""
  }`;
  return { subject, html, text };
}

// ── Spend summaries (weekly / monthly) ────────────────────────────────────────
function renderSpendSummary(
  periodLabel: "week" | "month",
  data: {
    name: string | null;
    periodStart: string;
    periodEnd: string;
  } & PeriodComparison,
): RenderedEmail {
  const name = greetNameHtml(data.name);
  const cap = periodLabel === "week" ? "Weekly" : "Monthly";
  const subject = `Your ${periodLabel}ly spending recap: ${formatMoney(
    data.total,
  )}`;
  let changeLine: string;
  if (data.changeDirection === "flat") {
    changeLine = `That's right in line with the previous ${periodLabel}.`;
  } else {
    const word = data.changeDirection === "up" ? "more" : "less";
    changeLine = `That's <strong>${formatMoney(
      data.changeAmount,
    )} ${word}</strong> than the previous ${periodLabel} (${formatMoney(
      data.previousTotal,
    )}).`;
  }
  const html = layout({
    heading: `Hi ${name}, here's your ${periodLabel}ly recap`,
    preview: subject,
    bodyHtml: `
      ${paragraph(
        `Spending from <strong>${escapeHtml(
          data.periodStart,
        )}</strong> to <strong>${escapeHtml(data.periodEnd)}</strong>:`,
      )}
      ${statCard(`Total this ${periodLabel}`, formatMoney(data.total))}
      ${paragraph(changeLine)}
    `,
  });
  const text = `Hi ${greetName(data.name)}, your ${cap.toLowerCase()} ${BRAND} recap (${data.periodStart} to ${data.periodEnd}): ${formatMoney(
    data.total,
  )}. ${
    data.changeDirection === "flat"
      ? `In line with the previous ${periodLabel}.`
      : `${formatMoney(data.changeAmount)} ${
          data.changeDirection === "up" ? "more" : "less"
        } than the previous ${periodLabel} (${formatMoney(data.previousTotal)}).`
  }`;
  return { subject, html, text };
}

// ── Template variable renderers (used when RESEND_TEMPLATE_* env vars are set)
// Each function mirrors its renderXxx counterpart but returns a flat
// Record<string, string> of {{{VARIABLE}}} values for Resend's template API.

export function renderTrialEndingVars(data: {
  name: string | null;
  daysLeft: number;
  trialEndsAt: string;
}): Record<string, string> {
  const dayWord = data.daysLeft === 1 ? "day" : "days";
  const subject =
    data.daysLeft <= 0
      ? "Your free trial ends today"
      : `Your free trial ends in ${data.daysLeft} ${dayWord}`;
  const ends = formatDate(data.trialEndsAt);
  return {
    SUBJECT: subject,
    NAME: greetName(data.name),
    DAYS_LEFT_PHRASE: data.daysLeft <= 0 ? "ends today" : `ends in ${data.daysLeft} ${dayWord}`,
    ENDS_DATE: ends ? ` (on ${ends})` : "",
  };
}

export function renderPastDueVars(data: {
  name: string | null;
  currentPeriodEnd: string | null;
}): Record<string, string> {
  const until = formatDate(data.currentPeriodEnd ?? undefined);
  return {
    SUBJECT: "We couldn't process your payment",
    NAME: greetName(data.name),
    ACCESS_UNTIL: until ? ` Your access continues until ${until}.` : "",
  };
}

export function renderListExportVars(data: {
  name: string | null;
  itemCount: number;
}): Record<string, string> {
  const itemWord = data.itemCount === 1 ? "item" : "items";
  return {
    SUBJECT: `Your shopping list has ${data.itemCount} ${itemWord} ready`,
    NAME: greetName(data.name),
    ITEM_COUNT: `${data.itemCount} ${itemWord}`,
  };
}

export function renderReceiptInactivityVars(data: {
  name: string | null;
  headline: string;
  body: string;
  neglectedStaple: string | null;
}): Record<string, string> {
  return {
    SUBJECT: data.headline,
    HEADLINE: data.headline,
    BODY: data.body,
    STAPLE_DISPLAY: data.neglectedStaple ? "block" : "none",
    STAPLE_ITEM: data.neglectedStaple ?? "",
  };
}

function spendSummaryVars(
  periodLabel: "week" | "month",
  data: { name: string | null; periodStart: string; periodEnd: string } & PeriodComparison,
): Record<string, string> {
  const total = formatMoney(data.total);
  const isFlat = data.changeDirection === "flat";
  const word = data.changeDirection === "up" ? "more" : "less";
  const changeLinePlain = isFlat
    ? `That's right in line with the previous ${periodLabel}.`
    : `That's ${formatMoney(data.changeAmount)} ${word} than the previous ${periodLabel} (${formatMoney(data.previousTotal)}).`;
  return {
    SUBJECT: `Your ${periodLabel}ly spending recap: ${total}`,
    NAME: greetName(data.name),
    PERIOD_START: data.periodStart,
    PERIOD_END: data.periodEnd,
    TOTAL: total,
    IS_FLAT: isFlat ? "block" : "none",
    IS_CHANGE: isFlat ? "none" : "block",
    CHANGE_AMOUNT: formatMoney(data.changeAmount),
    CHANGE_DIRECTION: word,
    PREVIOUS_TOTAL: formatMoney(data.previousTotal),
    CHANGE_LINE_TEXT: changeLinePlain,
  };
}

export function renderWeeklySummaryVars(
  data: { name: string | null; periodStart: string; periodEnd: string } & PeriodComparison,
): Record<string, string> {
  return spendSummaryVars("week", data);
}

export function renderMonthlySummaryVars(
  data: { name: string | null; periodStart: string; periodEnd: string } & PeriodComparison,
): Record<string, string> {
  return spendSummaryVars("month", data);
}

export function renderWeeklySummary(
  data: { name: string | null; periodStart: string; periodEnd: string } & PeriodComparison,
): RenderedEmail {
  return renderSpendSummary("week", data);
}

export function renderMonthlySummary(
  data: { name: string | null; periodStart: string; periodEnd: string } & PeriodComparison,
): RenderedEmail {
  return renderSpendSummary("month", data);
}

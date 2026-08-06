// Builds one Loops-ready MJML file per lifecycle email.
//
// Loops' custom-email upload wants a .zip containing `index.mjml` at the root
// (plus an optional `img/` folder), so each email gets its own directory here
// and each directory zips to exactly that shape. See ../LOOPS_EMAILS_HTML.md.
//
//   node email-templates/build.mjs        # writes <key>/index.mjml for every email
//
// Zipping is a separate step (Node has no built-in zip) — the md documents it.
//
// Every email shares the chrome defined in `render()`, so a palette or footer
// change is edited once here rather than in nine files.

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

// Derived from the app's light palette in
// artifacts/receipt-tracker/constants/colors.ts. Email clients have no reliable
// dark-mode support, so only the light palette is used. `body` and `faint` are
// email-only tints of the same teal-grey family — the app has no token at those
// weights (its mutedForeground is too dark for 12px footer text).
const C = {
  brand: "#04576A",       // app primary / tint
  brandInk: "#FFFFFF",    // text on brand
  ink: "#17242B",         // app foreground — headlines
  body: "#3A4B52",        // derived: body copy
  muted: "#4C6B66",       // app mutedForeground — meta lines
  faint: "#8FA3A0",       // derived: footer
  page: "#F7F6F9",        // app background
  card: "#FFFFFF",        // app card
  border: "#E6E4EC",      // app border
  alert: "#C13E77",       // app destructive — security/attention emails
  good: "#1E4D40",        // app priceGood
  sage: "#E3EDE9",        // app accent — tinted callout background
};

const LOGO = "https://5to9shopping.com/icon-512.png";
const SITE = "https://5to9shopping.com";
const LEGAL = "FivetoNine LLC · 483 Chestnut Street, Cedarhurst, NY 11518";

// `{unsubscribe_link}` is required by Loops in every uploaded email — it swaps
// in a per-contact URL at send time.
function render({ preview, title, accent = C.brand, headline, body, cta, signoff }) {
  return `<mjml>
  <mj-head>
    <mj-title>${title}</mj-title>
    <mj-preview>${preview}</mj-preview>
    <mj-attributes>
      <mj-all font-family="Inter, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" />
      <mj-text color="${C.body}" font-size="16px" line-height="1.6" />
    </mj-attributes>
    <mj-style inline="inline">
      a { color: ${C.brand}; }
    </mj-style>
  </mj-head>

  <mj-body background-color="${C.page}" width="600px">
    <!-- brand accent bar -->
    <mj-section background-color="${accent}" padding="0" border-radius="16px 16px 0 0">
      <mj-column><mj-spacer height="6px" /></mj-column>
    </mj-section>

    <mj-section background-color="${C.card}" padding="28px 32px 8px">
      <mj-column>
        <mj-image src="${LOGO}" alt="TimetoPay" width="44px" align="left" padding="0 0 16px" border-radius="10px" />
        <mj-text font-size="23px" font-weight="700" color="${C.ink}" line-height="1.3" padding="0 0 14px">${headline}</mj-text>
${body}
${cta ? `        <mj-button background-color="${accent}" color="${C.brandInk}" href="${cta.href}" border-radius="10px" font-size="16px" font-weight="600" inner-padding="14px 28px" padding="22px 0 6px" align="left">${cta.label}</mj-button>` : ""}
        <mj-divider border-color="${C.border}" border-width="1px" padding="20px 0 0" />
        <mj-text font-size="12px" color="${C.faint}" line-height="1.6" padding="14px 0 28px">
          ${signoff}<br />
          ${LEGAL}<br />
          <a href="${SITE}" style="color:${C.faint};">5to9shopping.com</a> · <a href="{unsubscribe_link}" style="color:${C.faint};">Unsubscribe</a>
        </mj-text>
      </mj-column>
    </mj-section>
  </mj-body>
</mjml>
`;
}

const p = (t, extra = "") =>
  `        <mj-text padding="0 0 12px"${extra}>${t}</mj-text>`;

// Variable syntax follows Loops' rules for event-triggered emails:
//   {firstName}                  -> contact property (the app always sends this
//                                   as contactProperties)
//   {EVENT_PROPERTY:name}        -> event property, camelCase, must match the
//                                   eventProperties keys the server sends
// Verified against artifacts/api-server/src/lib/notifications/reminders.ts,
// lib/email/transactional.ts and routes/me.ts.
const EMAILS = [
  {
    key: "welcome",
    title: "Welcome to TimetoPay",
    preview: "Your grocery prices, tracked automatically.",
    headline: "Welcome to TimetoPay, {firstName} 🛒",
    body: [
      p("You're all set to start spending less on groceries. The fastest way to see it work:"),
      `        <mj-text line-height="1.8" padding="0 0 4px">📸 <strong>Scan a receipt</strong> — we pull out every item and price.<br />📈 <strong>Build price history</strong> — the best store and price for what you buy.<br />🛒 <strong>Get a smart shopping list</strong> — built from your purchases.</mj-text>`,
    ].join("\n"),
    cta: { label: "Scan your first receipt →", href: `${SITE}/scan` },
    signoff: "Happy saving, the TimetoPay team",
  },
  {
    key: "account_deleted",
    title: "Your TimetoPay account has been deleted",
    preview: "Sorry to see you go.",
    headline: "Your account has been deleted",
    body: p(
      "This confirms your TimetoPay account and all of its data have been deleted. If this wasn't you, or you change your mind, you're always welcome back.",
    ),
    cta: { label: "Visit TimetoPay", href: SITE },
    signoff: "Thanks for giving TimetoPay a try.",
  },
  {
    key: "list_export_ready",
    title: "Your shopping list is ready",
    preview: "Grab the best prices before your next trip.",
    headline: "Your shopping list is ready 🛒",
    body: [
      p(
        "Hi {firstName}, you've got <strong>{EVENT_PROPERTY:itemCount} items</strong> on your TimetoPay list, with the best store and price for each.",
      ),
      p("You can also download a printable version grouped by store or category."),
    ].join("\n"),
    cta: { label: "Open your list →", href: `${SITE}/shopping` },
    signoff: "Happy shopping, the TimetoPay team",
  },
  {
    key: "receipt_inactivity",
    title: "Keep your price history up to date",
    preview: "Keep your price history up to date.",
    // headline + body are written by the app (see notifications/snark.ts), so
    // they come straight through as event properties.
    headline: "{EVENT_PROPERTY:headline}",
    body: p("Hi {firstName},") + "\n" + p("{EVENT_PROPERTY:body}"),
    cta: { label: "Scan a receipt →", href: `${SITE}/scan` },
    signoff: "The TimetoPay team",
  },
  {
    key: "weekly_summary",
    title: "Your grocery week",
    preview: "{EVENT_PROPERTY:periodStart} – {EVENT_PROPERTY:periodEnd}",
    headline: "Your grocery week",
    // total / previousTotal / changeAmount arrive as raw numbers (comparePeriods
    // rounds to 2dp but does not format currency), so the $ is added here.
    body: [
      `        <mj-text font-size="13px" color="${C.muted}" padding="0 0 14px">{EVENT_PROPERTY:periodStart} – {EVENT_PROPERTY:periodEnd}</mj-text>`,
      p("Hi {firstName}, here's how the week went:"),
      `        <mj-text line-height="1.9" padding="0 0 4px">🧾 <strong>Spent this week:</strong> \${EVENT_PROPERTY:total}<br />📅 <strong>Week before:</strong> \${EVENT_PROPERTY:previousTotal}<br />📈 <strong>Change:</strong> {EVENT_PROPERTY:changeDirection} \${EVENT_PROPERTY:changeAmount}</mj-text>`,
    ].join("\n"),
    cta: { label: "See your analytics →", href: SITE },
    signoff: "The TimetoPay team",
  },
  {
    key: "monthly_summary",
    title: "Your grocery month",
    preview: "{EVENT_PROPERTY:periodStart} – {EVENT_PROPERTY:periodEnd}",
    headline: "Your grocery month",
    body: [
      `        <mj-text font-size="13px" color="${C.muted}" padding="0 0 14px">{EVENT_PROPERTY:periodStart} – {EVENT_PROPERTY:periodEnd}</mj-text>`,
      p("Hi {firstName}, here's how the month went:"),
      `        <mj-text line-height="1.9" padding="0 0 4px">🧾 <strong>Spent this month:</strong> \${EVENT_PROPERTY:total}<br />📅 <strong>Month before:</strong> \${EVENT_PROPERTY:previousTotal}<br />📈 <strong>Change:</strong> {EVENT_PROPERTY:changeDirection} \${EVENT_PROPERTY:changeAmount}</mj-text>`,
    ].join("\n"),
    cta: { label: "See your analytics →", href: SITE },
    signoff: "The TimetoPay team",
  },
  {
    key: "preferences_updated",
    title: "Your TimetoPay email preferences were updated",
    preview: "A quick confirmation of your changes.",
    headline: "Your email preferences were updated",
    body: [
      p(
        "Hi {firstName}, this is a quick confirmation that your email preferences on TimetoPay were just updated.",
      ),
      p("You can review or change them anytime under <strong>Account → Notifications</strong>. If you didn't make this change, please reply and let us know."),
    ].join("\n"),
    cta: { label: "Manage preferences →", href: `${SITE}/account` },
    signoff: "The TimetoPay team",
  },
  {
    key: "password_reset_required",
    title: "Action needed: reset your TimetoPay password",
    preview: "You'll be asked for a new password next time you sign in.",
    // Security email — uses the alert colour rather than brand teal so it reads
    // as "act on this", not marketing.
    accent: C.alert,
    headline: "Reset your password",
    body: [
      p(
        "Hi {firstName}, for security an administrator has required a new password on your TimetoPay account. You've been signed out on all your devices.",
      ),
      `        <mj-text line-height="1.8" padding="0 0 12px"><strong>To get back in:</strong><br />1. Open TimetoPay and go to the sign-in screen.<br />2. Tap <strong>Forgot password</strong>.<br />3. Follow the emailed link to set a new password.</mj-text>`,
      p(
        `<span style="color:${C.muted};">We'll never email you a password or ask you to reply with one. If you weren't expecting this, contact us before signing in.</span>`,
      ),
    ].join("\n"),
    cta: { label: "Go to sign in →", href: `${SITE}/sign-in` },
    signoff: "The TimetoPay team",
  },
  {
    key: "trip_receipt_missing",
    title: "Did you keep the receipt?",
    preview: "Your prices only update when the receipt does.",
    headline: "Did you keep the receipt? 🧾",
    body: [
      p(
        "Hi {firstName}, you ticked off <strong>{EVENT_PROPERTY:itemsPicked} items</strong> on your last shop {EVENT_PROPERTY:daysSince} days ago — but we haven't seen the receipt yet.",
      ),
      p(
        "Adding it takes about ten seconds, and it's what keeps the good stuff working: your price history, best-store suggestions and spend totals all come from receipts.",
      ),
      p(
        `<span style="color:${C.muted};">Already added it somewhere else? Then you're all set — we'll stop asking.</span>`,
      ),
    ].join("\n"),
    cta: { label: "Add that receipt →", href: `${SITE}/scan` },
    signoff: "The TimetoPay team",
  },
];

let n = 0;
for (const email of EMAILS) {
  const dir = join(HERE, email.key);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "index.mjml"), render(email), "utf8");
  console.log(`  ${email.key}/index.mjml`);
  n++;
}
console.log(`\n${n} templates written.`);

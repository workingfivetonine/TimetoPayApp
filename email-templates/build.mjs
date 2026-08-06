// Builds one Loops-ready LMX file per lifecycle email.
//
//   node email-templates/build.mjs            # write dist/<key>.lmx for every email
//   node email-templates/build.mjs --check    # validate only, write nothing
//
// To push these into Loops, see push.mjs in this folder.
//
// WHY LMX AND NOT MJML
// Loops stores its own copy of an uploaded MJML zip, so every copy edit meant
// re-uploading ten zips by hand. Loops will not accept HTML or MJML over the API
// on purpose ("we don't believe emails belong in your codebase"), but it will
// accept LMX, its own XML format. Porting to LMX is what makes these templates
// pushable, which also brings subject lines into code -- a zip carries no
// subject, so all ten used to be hand-typed in the dashboard.
//
// LMX RULES LEARNED THE HARD WAY (the API rejects violations with a 422)
//   * lineHeight is 100-300, NOT 1.0-3.0
//   * fontSize is 12-64, so you cannot fake a thin bar with a 1px paragraph
//   * images MUST be Loops-hosted; external URLs are refused outright
//   * variables must be prefixed. Bare {firstName} is invalid.
//   * no raw HTML escape hatch exists
//   * Loops appends the postal address and unsubscribe link itself, so a
//     hand-built footer would duplicate them

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const DIST = join(HERE, "dist");

// Derived from the app's light palette in
// artifacts/receipt-tracker/constants/colors.ts. Email clients have no dependable
// dark-mode support, so only the light palette is used. `body` and `faint` are
// email-only tints: the app's mutedForeground is too dark for 12px footer text.
const C = {
  brand: "#04576A",
  ink: "#17242B",
  body: "#3A4B52",
  muted: "#4C6B66",
  faint: "#8FA3A0",
  page: "#F7F6F9",
  card: "#FFFFFF",
  border: "#E6E4EC",
  alert: "#C13E77",
};

// Uploaded to the Loops CDN via scripts/src/lmx-preview.mjs. LMX only accepts
// Loops-hosted images, so this cannot be a path or an external URL. To replace
// it, upload a new asset and swap this constant.
const LOGO = "https://images.vialoops.com/cmqh4bout01n20jzzyz0jdajq/cmshvmqeu08y60jwe7ylv0k1g.png";
const SITE = "https://5to9shopping.com";

// Shared chrome. Everything visual lives here so a rebrand is one edit, not ten.
function style(accent = C.brand) {
  return `<Style
  backgroundColor="${C.page}"
  backgroundYPadding="24"
  bodyColor="${C.card}"
  bodyXPadding="32"
  bodyYPadding="28"
  borderColor="${C.border}"
  borderWidth="1"
  borderRadius="16"
  textBaseColor="${C.body}"
  textBaseFontSize="16"
  textBaseLineHeight="160"
  textLinkColor="${C.brand}"
  heading1Color="${C.ink}"
  heading1FontSize="23"
  heading1LineHeight="130"
  buttonBodyColor="${accent}"
  buttonTextColor="#FFFFFF"
  buttonBorderRadius="10"
  buttonBodyXPadding="28"
  buttonBodyYPadding="14"
  buttonTextFontSize="16"
  dividerColor="${C.border}"
  dividerBorderWidth="1"
/>`;
}

function render({ accent = C.brand, headline, body, cta, signoff }) {
  // The accent bar is a thick Divider. A Section wrapping a tiny paragraph was
  // the obvious approach and it is impossible: fontSize has a floor of 12.
  return `${style(accent)}

<Divider color="${accent}" borderWidth="6" paddingTop="0" paddingBottom="20" />

<Image src="${LOGO}" alt="TimetoPay" width="44" align="left" borderRadius="10" paddingBottom="20" />

<H1 paddingBottom="14">${headline}</H1>

${body}

${cta ? `<Button href="${cta.href}">${cta.label}</Button>\n` : ""}
<Divider paddingTop="24" paddingBottom="16" />

<Paragraph fontSize="12" lineHeight="160"><Text textColor="${C.faint}">${signoff}</Text></Paragraph>
`;
}

// One Paragraph per line. Do NOT build lists with <Br />: it gives no vertical
// gap, and the source indentation after each break leaks through as a visible
// leading space.
const p = (text, padBottom = 16) =>
  `<Paragraph paddingBottom="${padBottom}">${text}</Paragraph>`;
const muted = (text, padBottom = 16) =>
  `<Paragraph paddingBottom="${padBottom}"><Text textColor="${C.muted}">${text}</Text></Paragraph>`;

// VARIABLE SYNTAX, which differs by how the email is triggered:
//   {contact.x}  contact property. The app always sends firstName this way.
//   {event.x}    event property, for workflow (Loop) emails only.
//   {data.x}     transactional only.
// A campaign has no event payload, so {event.x} would render as literal text
// there. `kind` below records which each email is, so that is reviewable.
const EMAILS = [
  {
    key: "welcome",
    kind: "workflow",
    subject: "Welcome to TimetoPay, {contact.firstName}",
    previewText: "Your grocery prices, tracked automatically.",
    headline: "Welcome to TimetoPay, {contact.firstName}",
    body: [
      p("You're set up. The quickest way to see what it does:"),
      p("<Strong>Scan a receipt.</Strong> We pull out every item and price for you.", 10),
      p("<Strong>Build up your price history.</Strong> After a few receipts you'll see the best store and price for the things you buy often.", 10),
      p("<Strong>Get a shopping list.</Strong> Built from what you actually buy.", 24),
    ].join("\n\n"),
    cta: { label: "Scan your first receipt", href: `${SITE}/scan` },
    signoff: "Happy saving, the TimetoPay team",
  },
  {
    key: "account_deleted",
    kind: "workflow",
    subject: "Your TimetoPay account has been deleted",
    previewText: "Sorry to see you go.",
    headline: "Your account has been deleted",
    body: p(
      "This confirms your TimetoPay account and all of its data have been deleted. If this wasn't you, or you change your mind, you're always welcome back.",
      24,
    ),
    cta: { label: "Visit TimetoPay", href: SITE },
    signoff: "Thanks for giving TimetoPay a try.",
  },
  {
    key: "list_export_ready",
    kind: "workflow",
    subject: "Your shopping list is ready ({event.itemCount} items)",
    previewText: "Grab the best prices before your next trip.",
    headline: "Your shopping list is ready",
    body: [
      p("Hi {contact.firstName}, you've got <Strong>{event.itemCount} items</Strong> on your TimetoPay list, with the best store and price for each."),
      p("You can also download a printable version grouped by store or category.", 24),
    ].join("\n\n"),
    cta: { label: "Open your list", href: `${SITE}/shopping` },
    signoff: "Happy shopping, the TimetoPay team",
  },
  {
    key: "receipt_inactivity",
    kind: "workflow",
    // headline and body are written by the app (notifications/snark.ts) and
    // arrive as event properties, so this template is mostly a shell.
    subject: "{event.headline}",
    previewText: "Keep your price history up to date.",
    headline: "{event.headline}",
    body: [p("Hi {contact.firstName},"), p("{event.body}", 24)].join("\n\n"),
    cta: { label: "Scan a receipt", href: `${SITE}/scan` },
    signoff: "The TimetoPay team",
  },
  {
    key: "weekly_summary",
    kind: "workflow",
    // total / previousTotal / changeAmount arrive as raw numbers: comparePeriods
    // rounds to 2dp and stops there, so the currency symbol is added here.
    subject: "Your grocery week: ${event.total} spent",
    previewText: "{event.periodStart} to {event.periodEnd}",
    headline: "Your grocery week",
    body: [
      muted("{event.periodStart} to {event.periodEnd}", 14),
      p("Hi {contact.firstName}, here's how the week went."),
      p("<Strong>Spent this week:</Strong> ${event.total}", 8),
      p("<Strong>Week before:</Strong> ${event.previousTotal}", 8),
      p("<Strong>Change:</Strong> {event.changeDirection} ${event.changeAmount}", 24),
    ].join("\n\n"),
    cta: { label: "See your analytics", href: SITE },
    signoff: "The TimetoPay team",
  },
  {
    key: "monthly_summary",
    kind: "workflow",
    subject: "Your grocery month: ${event.total} spent",
    previewText: "{event.periodStart} to {event.periodEnd}",
    headline: "Your grocery month",
    body: [
      muted("{event.periodStart} to {event.periodEnd}", 14),
      p("Hi {contact.firstName}, here's how the month went."),
      p("<Strong>Spent this month:</Strong> ${event.total}", 8),
      p("<Strong>Month before:</Strong> ${event.previousTotal}", 8),
      p("<Strong>Change:</Strong> {event.changeDirection} ${event.changeAmount}", 24),
    ].join("\n\n"),
    cta: { label: "See your analytics", href: SITE },
    signoff: "The TimetoPay team",
  },
  {
    key: "preferences_updated",
    kind: "workflow",
    subject: "Your TimetoPay email preferences were updated",
    previewText: "A quick confirmation of your changes.",
    headline: "Your email preferences were updated",
    body: [
      p("Hi {contact.firstName}, this is a quick confirmation that your email preferences on TimetoPay were just updated."),
      p("You can review or change them anytime under <Strong>Account, then Notifications</Strong>. If you didn't make this change, please reply and let us know.", 24),
    ].join("\n\n"),
    cta: { label: "Manage preferences", href: `${SITE}/account` },
    signoff: "The TimetoPay team",
  },
  {
    key: "password_reset_required",
    kind: "workflow",
    // Security email, so it uses the alert colour rather than brand teal. It
    // should not read as marketing.
    accent: C.alert,
    subject: "Action needed: reset your TimetoPay password",
    previewText: "You'll be asked for a new password next time you sign in.",
    headline: "Reset your password",
    body: [
      p("Hi {contact.firstName}, for security an administrator has required a new password on your TimetoPay account. You've been signed out on all your devices."),
      p("<Strong>To get back in:</Strong>", 8),
      p("1. Open TimetoPay and go to the sign-in screen.", 6),
      p("2. Tap <Strong>Forgot password</Strong>.", 6),
      p("3. Follow the emailed link to set a new password.", 16),
      muted("We'll never email you a password or ask you to reply with one. If you weren't expecting this, contact us before signing in.", 24),
    ].join("\n\n"),
    cta: { label: "Go to sign in", href: `${SITE}/sign-in` },
    signoff: "The TimetoPay team",
  },
  {
    key: "trip_receipt_missing",
    kind: "workflow",
    subject: "Did you keep the receipt?",
    previewText: "Your prices only update when the receipt does.",
    headline: "Did you keep the receipt?",
    // Deliberately avoids {event.itemsPicked} and {event.daysSince}, even though
    // the app sends both. Loops validates {event.x} against properties it has
    // actually observed for the event, and this event has never successfully
    // fired in production -- its Loop trigger was misspelled as
    // Trip_receipt_inactivity, so every send went nowhere. Until real events have
    // flowed, referencing those properties makes the push 422 with
    // "Unknown event property".
    //
    // To restore the specific version once the event has fired for real:
    //   p("Hi {contact.firstName}, you ticked off <Strong>{event.itemsPicked} items</Strong> on your last shop {event.daysSince} days ago, but we haven't seen the receipt yet."),
    body: [
      p("Hi {contact.firstName}, you finished a shop recently, but we haven't seen the receipt yet."),
      p("Adding it takes about ten seconds, and it's what keeps everything else working. Your price history, best-store suggestions and spend totals all come from receipts."),
      muted("Already added it somewhere else? Then you're all set and we'll stop asking.", 24),
    ].join("\n\n"),
    cta: { label: "Add that receipt", href: `${SITE}/scan` },
    signoff: "The TimetoPay team",
  },
  {
    key: "announce_2_0",
    // A CAMPAIGN, not a workflow. No event payload exists, so {event.x} would
    // render as literal text here. Contact properties only.
    kind: "campaign",
    subject: "TimetoPay is now free",
    previewText: "No more subscriptions, plus Shopping Mode and a new look.",
    headline: "TimetoPay is now free",
    body: [
      p("Hi {contact.firstName}, a few things have changed since you last opened the app."),
      p("<Strong>Everything is free now.</Strong> Subscriptions and scan limits are gone. Unlimited receipt scanning, multi-page PDF imports, your full price history and every analytics view are all open. No card, no trial."),
      p("Also new:"),
      p("<Strong>A new look.</Strong> Redesigned throughout, with a proper dark mode that follows your phone's setting.", 10),
      p("<Strong>Shopping Mode.</Strong> Tick items off while you're actually in the store.", 10),
      p("<Strong>In-app camera.</Strong> Snap receipts directly, or share them in from Photos.", 10),
      p("<Strong>Tax and discounts.</Strong> Now recorded properly instead of discarded.", 10),
      p("<Strong>Better item matching.</Strong> Scanned items line up with what you've bought at that store before.", 16),
      muted("Your receipts, price history and lists are all exactly where you left them.", 24),
    ].join("\n\n"),
    cta: { label: "Open TimetoPay", href: `${SITE}/scan` },
    signoff: "Thanks for sticking with us, the TimetoPay team",
  },
];

// Catch the mistakes the API would 422 on, before anything is pushed.
function validate(email, lmx) {
  const problems = [];

  // Match the capitalised Style-tag forms too (textBaseLineHeight,
  // heading1FontSize, buttonTextFontSize...), not just the per-element
  // lineHeight/fontSize. A case-sensitive check silently skipped every value in
  // <Style>, which is where the original 1.x-scale mistake actually lived.
  for (const m of lmx.matchAll(/(\w*[Ll]ineHeight)="([^"]+)"/g)) {
    const v = Number(m[2]);
    if (!(v >= 100 && v <= 300)) problems.push(`${m[1]}="${m[2]}" (must be 100-300)`);
  }
  for (const m of lmx.matchAll(/(\w*[Ff]ontSize)="([^"]+)"/g)) {
    const v = Number(m[2]);
    if (!(v >= 12 && v <= 64)) problems.push(`${m[1]}="${m[2]}" (must be 12-64)`);
  }
  if (lmx.includes("<Br />")) problems.push("<Br /> present (use separate Paragraphs)");
  if (/src="(?!https:\/\/images\.vialoops\.com)/.test(lmx)) {
    problems.push("image src is not a Loops-hosted URL");
  }

  // Unprefixed placeholders are invalid in LMX and fail silently as literal text.
  const combined = `${email.subject} ${email.previewText} ${lmx}`;
  for (const m of combined.matchAll(/\{([a-zA-Z][a-zA-Z0-9_]*)\}/g)) {
    problems.push(`unprefixed variable {${m[1]}} (needs contact./event./data.)`);
  }
  // A campaign carries no event payload.
  if (email.kind === "campaign" && /\{event\./.test(combined)) {
    problems.push("campaign uses {event.x}, which cannot resolve");
  }
  // Leftovers from the MJML era.
  for (const stale of ["EVENT_PROPERTY", "DATA_VARIABLE", "{unsubscribe_link}"]) {
    if (combined.includes(stale)) problems.push(`stale MJML-era token: ${stale}`);
  }

  return problems;
}

const checkOnly = process.argv.includes("--check");
mkdirSync(DIST, { recursive: true });

let failed = 0;
const manifest = [];

for (const email of EMAILS) {
  const lmx = render(email);
  const problems = validate(email, lmx);

  if (problems.length) {
    failed++;
    console.log(`  FAIL  ${email.key}`);
    for (const p of problems) console.log(`          ${p}`);
    continue;
  }

  if (!checkOnly) writeFileSync(join(DIST, `${email.key}.lmx`), lmx, "utf8");
  manifest.push({
    key: email.key,
    kind: email.kind,
    subject: email.subject,
    previewText: email.previewText,
  });
  console.log(`  ok    ${email.key.padEnd(24)} ${email.kind.padEnd(9)} "${email.subject}"`);
}

if (!checkOnly) {
  // push.mjs reads this so subjects travel with the content.
  writeFileSync(join(DIST, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8");
}

console.log(
  `\n${manifest.length}/${EMAILS.length} templates ${checkOnly ? "valid" : `written to dist/`}` +
    (failed ? `, ${failed} FAILED` : ""),
);
if (failed) process.exit(1);

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

import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateRawSync } from "node:zlib";

const HERE = dirname(fileURLToPath(import.meta.url));

// The logo ships INSIDE each zip rather than as an absolute URL. Loops rewrites
// any `img/...` path to its own hosted copy on upload, which means the logo
// renders even though most clients block remote images by default — an absolute
// https:// src shows as a broken image until the reader clicks "load images".
// 192px for a 44px slot covers retina with room to spare (~34KB).
const LOGO_SRC = join(HERE, "..", "artifacts", "receipt-tracker", "public", "icon-192.png");

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

const LOGO = "img/logo.png";
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
    headline: "Welcome to TimetoPay, {firstName}",
    body: [
      p("You're set up. The quickest way to see what it does:"),
      `        <mj-text line-height="1.8" padding="0 0 4px"><strong>Scan a receipt.</strong> We pull out every item and price for you.<br /><strong>Build up your price history.</strong> After a few receipts you'll see the best store and price for the things you buy often.<br /><strong>Get a shopping list.</strong> Built from what you actually buy.</mj-text>`,
    ].join("\n"),
    cta: { label: "Scan your first receipt", href: `${SITE}/scan` },
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
    headline: "Your shopping list is ready",
    body: [
      p(
        "Hi {firstName}, you've got <strong>{EVENT_PROPERTY:itemCount} items</strong> on your TimetoPay list, with the best store and price for each.",
      ),
      p("You can also download a printable version grouped by store or category."),
    ].join("\n"),
    cta: { label: "Open your list", href: `${SITE}/shopping` },
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
    cta: { label: "Scan a receipt", href: `${SITE}/scan` },
    signoff: "The TimetoPay team",
  },
  {
    key: "weekly_summary",
    title: "Your grocery week",
    preview: "{EVENT_PROPERTY:periodStart} to {EVENT_PROPERTY:periodEnd}",
    headline: "Your grocery week",
    // total / previousTotal / changeAmount arrive as raw numbers (comparePeriods
    // rounds to 2dp but does not format currency), so the $ is added here.
    body: [
      `        <mj-text font-size="13px" color="${C.muted}" padding="0 0 14px">{EVENT_PROPERTY:periodStart} to {EVENT_PROPERTY:periodEnd}</mj-text>`,
      p("Hi {firstName}, here's how the week went."),
      `        <mj-text line-height="1.9" padding="0 0 4px"><strong>Spent this week:</strong> \${EVENT_PROPERTY:total}<br /><strong>Week before:</strong> \${EVENT_PROPERTY:previousTotal}<br /><strong>Change:</strong> {EVENT_PROPERTY:changeDirection} \${EVENT_PROPERTY:changeAmount}</mj-text>`,
    ].join("\n"),
    cta: { label: "See your analytics", href: SITE },
    signoff: "The TimetoPay team",
  },
  {
    key: "monthly_summary",
    title: "Your grocery month",
    preview: "{EVENT_PROPERTY:periodStart} to {EVENT_PROPERTY:periodEnd}",
    headline: "Your grocery month",
    body: [
      `        <mj-text font-size="13px" color="${C.muted}" padding="0 0 14px">{EVENT_PROPERTY:periodStart} to {EVENT_PROPERTY:periodEnd}</mj-text>`,
      p("Hi {firstName}, here's how the month went."),
      `        <mj-text line-height="1.9" padding="0 0 4px"><strong>Spent this month:</strong> \${EVENT_PROPERTY:total}<br /><strong>Month before:</strong> \${EVENT_PROPERTY:previousTotal}<br /><strong>Change:</strong> {EVENT_PROPERTY:changeDirection} \${EVENT_PROPERTY:changeAmount}</mj-text>`,
    ].join("\n"),
    cta: { label: "See your analytics", href: SITE },
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
      p("You can review or change them anytime under <strong>Account, then Notifications</strong>. If you didn't make this change, please reply and let us know."),
    ].join("\n"),
    cta: { label: "Manage preferences", href: `${SITE}/account` },
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
    cta: { label: "Go to sign in", href: `${SITE}/sign-in` },
    signoff: "The TimetoPay team",
  },
  {
    // One-off CAMPAIGN announcing 2.0 to existing users — not triggered by an
    // event. That constrains the variables: a campaign has no event payload, so
    // only contact properties like {firstName} resolve here. Using
    // {EVENT_PROPERTY:...} in a campaign renders the literal text.
    key: "announce_2_0",
    title: "TimetoPay is now free",
    preview: "No more subscriptions, plus Shopping Mode and a new look.",
    headline: "TimetoPay is now free",
    body: [
      p("Hi {firstName}, a few things have changed since you last opened the app."),
      p(
        "<strong>Everything is free now.</strong> Subscriptions and scan limits are gone. Unlimited receipt scanning, multi-page PDF imports, your full price history and every analytics view are all open. No card, no trial.",
      ),
      p("Also new:"),
      `        <mj-text line-height="1.85" padding="0 0 12px"><strong>A new look.</strong> Redesigned throughout, with a proper dark mode that follows your phone's setting.<br /><strong>Shopping Mode.</strong> Tick items off while you're actually in the store.<br /><strong>In-app camera.</strong> Snap receipts directly, or share them in from Photos.<br /><strong>Tax and discounts.</strong> Now recorded properly instead of discarded.<br /><strong>Better item matching.</strong> Scanned items line up with what you've bought at that store before.</mj-text>`,
      p(
        `<span style="color:${C.muted};">Your receipts, price history and lists are all exactly where you left them.</span>`,
      ),
    ].join("\n"),
    cta: { label: "Open TimetoPay", href: `${SITE}/scan` },
    signoff: "Thanks for sticking with us, the TimetoPay team",
  },
  {
    key: "trip_receipt_missing",
    title: "Did you keep the receipt?",
    preview: "Your prices only update when the receipt does.",
    headline: "Did you keep the receipt?",
    body: [
      p(
        "Hi {firstName}, you ticked off <strong>{EVENT_PROPERTY:itemsPicked} items</strong> on your last shop {EVENT_PROPERTY:daysSince} days ago, but we haven't seen the receipt yet.",
      ),
      p(
        "Adding it takes about ten seconds, and it's what keeps everything else working. Your price history, best-store suggestions and spend totals all come from receipts.",
      ),
      p(
        `<span style="color:${C.muted};">Already added it somewhere else? Then you're all set and we'll stop asking.</span>`,
      ),
    ].join("\n"),
    cta: { label: "Add that receipt", href: `${SITE}/scan` },
    signoff: "The TimetoPay team",
  },
];

// ── zip writer ───────────────────────────────────────────────────────────────
// Hand-rolled because the obvious Windows tools get the entry names wrong:
// both PowerShell 5.1's Compress-Archive and .NET Framework's
// ZipFile.CreateFromDirectory store "img\logo.png" with a BACKSLASH. The ZIP
// spec (APPNOTE 4.4.17.1) requires forward slashes, and Loops unpacks on Linux,
// where a backslash name is a file literally called "img\logo.png" at the root
// rather than a folder — so the logo silently fails to resolve. Writing the
// archive here keeps entry names correct on every platform and needs no deps.

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

// Fixed DOS timestamp (1 Jan 2026) so rebuilding an unchanged template produces
// a byte-identical zip instead of a spurious diff.
const DOS_TIME = 0;
const DOS_DATE = ((2026 - 1980) << 9) | (1 << 5) | 1;

function zip(files) {
  const locals = [];
  const centrals = [];
  let offset = 0;

  for (const { name, data } of files) {
    const nameBuf = Buffer.from(name, "utf8");
    const deflated = deflateRawSync(data, { level: 9 });
    const crc = crc32(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);          // version needed
    local.writeUInt16LE(0, 6);           // flags
    local.writeUInt16LE(8, 8);           // deflate
    local.writeUInt16LE(DOS_TIME, 10);
    local.writeUInt16LE(DOS_DATE, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(deflated.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);          // extra length
    locals.push(local, nameBuf, deflated);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);        // version made by
    central.writeUInt16LE(20, 6);        // version needed
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(DOS_TIME, 12);
    central.writeUInt16LE(DOS_DATE, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(deflated.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt16LE(0, 30);        // extra
    central.writeUInt16LE(0, 32);        // comment
    central.writeUInt16LE(0, 34);        // disk start
    central.writeUInt16LE(0, 36);        // internal attrs
    central.writeUInt32LE(0, 38);        // external attrs
    central.writeUInt32LE(offset, 42);   // local header offset
    centrals.push(central, nameBuf);

    offset += local.length + nameBuf.length + deflated.length;
  }

  const cd = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(cd.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...locals, cd, eocd]);
}

// ── build ────────────────────────────────────────────────────────────────────
const DIST = join(HERE, "dist");
mkdirSync(DIST, { recursive: true });
const logo = readFileSync(LOGO_SRC);

let n = 0;
for (const email of EMAILS) {
  const dir = join(HERE, email.key);
  const mjml = render(email);

  // Keep the unpacked copy too — it's what you edit/validate by hand.
  mkdirSync(join(dir, "img"), { recursive: true });
  writeFileSync(join(dir, "index.mjml"), mjml, "utf8");
  copyFileSync(LOGO_SRC, join(dir, "img", "logo.png"));

  // Forward slashes, and index.mjml at the archive root — the shape Loops wants.
  writeFileSync(
    join(DIST, `${email.key}.zip`),
    zip([
      { name: "index.mjml", data: Buffer.from(mjml, "utf8") },
      { name: "img/logo.png", data: logo },
    ]),
  );

  console.log(`  ${email.key.padEnd(24)} index.mjml + img/logo.png`);
  n++;
}
console.log(`\n${n} templates written, ${n} zips in dist/.`);

// Fires one event at Loops so it learns the event's property names.
//
//   LOOPS_API_KEY=xxx node scripts/src/loops-seed-event.mjs trip_receipt_missing you@example.com
//   LOOPS_API_KEY=xxx node scripts/src/loops-seed-event.mjs --list
//
// WHY THIS EXISTS
// Loops validates {event.x} references against the properties it has actually
// observed for that event. Push an LMX template referencing a property Loops has
// never seen and it 422s with:
//
//   Unknown event property "itemsPicked"
//
// That is what happens for an event the app has never successfully fired -- for
// instance because its Loop trigger was misspelled. Sending one event with the
// real property names teaches Loops the schema, after which the push succeeds.
//
// ⚠️ IF THE LOOP IS PUBLISHED, THIS SENDS A REAL EMAIL to the address you pass.
// Use your own address, or unpublish the Loop first.
//
// The property names and example values below mirror exactly what the app sends,
// so Loops learns the right shape. Sources:
//   artifacts/api-server/src/lib/notifications/reminders.ts
//   artifacts/api-server/src/lib/email/transactional.ts
//   artifacts/api-server/src/routes/me.ts

const BASE = "https://app.loops.so/api/v1";
const KEY = process.env.LOOPS_API_KEY?.trim();

// Mirrors the eventProperties each loopsSendEvent call site actually sends.
// firstName is a CONTACT property everywhere, so it is sent separately.
const EVENTS = {
  welcome: {},
  account_deleted: {},
  preferences_updated: {},
  password_reset_required: {},
  list_export_ready: { itemCount: 12 },
  receipt_inactivity: {
    daysSinceLastReceipt: 9,
    headline: "Your prices are getting stale",
    body: "It has been a while since your last receipt.",
    neglectedStaple: "Milk",
  },
  trip_receipt_missing: { itemsPicked: 7, daysSince: 8 },
  weekly_summary: {
    periodStart: "2026-07-27",
    periodEnd: "2026-08-02",
    total: 128.44,
    previousTotal: 141.9,
    changeAmount: 13.46,
    changeDirection: "down",
  },
  monthly_summary: {
    periodStart: "2026-07-01",
    periodEnd: "2026-07-31",
    total: 512.18,
    previousTotal: 489.02,
    changeAmount: 23.16,
    changeDirection: "up",
  },
};

if (process.argv.includes("--list")) {
  console.log("Known events and the properties they carry:\n");
  for (const [name, props] of Object.entries(EVENTS)) {
    const keys = Object.keys(props);
    console.log(`  ${name.padEnd(26)} ${keys.length ? keys.join(", ") : "(no event properties)"}`);
  }
  process.exit(0);
}

const eventName = process.argv[2];
const email = process.argv[3];

if (!KEY) {
  console.error("ERROR: set LOOPS_API_KEY (Loops > Settings > API).");
  process.exit(1);
}
if (!eventName || !EVENTS[eventName]) {
  console.error(`ERROR: pass a known event name. Try --list.`);
  if (eventName) console.error(`  "${eventName}" is not one of them.`);
  process.exit(1);
}
if (!email || !email.includes("@")) {
  console.error("ERROR: pass the email address to fire the event against.");
  console.error("  Use your own. If the Loop is published, this sends a real email.");
  process.exit(1);
}

const eventProperties = EVENTS[eventName];

console.log(`Firing "${eventName}" at ${email}`);
console.log(
  `  eventProperties: ${Object.keys(eventProperties).length ? JSON.stringify(eventProperties) : "(none)"}`,
);
if (!Object.keys(eventProperties).length) {
  console.log("\n  This event carries no properties, so there is nothing for Loops to");
  console.log("  learn. You only need this for events whose templates use {event.x}.");
}

const res = await fetch(`${BASE}/events/send`, {
  method: "POST",
  headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
  body: JSON.stringify({
    email,
    eventName,
    eventProperties,
    // Matches how the app upserts the contact alongside the event.
    contactProperties: { firstName: "Test" },
  }),
});

const text = await res.text();
if (!res.ok) {
  console.error(`\nFAILED -> HTTP ${res.status}`);
  console.error(text);
  process.exitCode = 1;
} else {
  console.log(`\nSent. ${text}`);
  console.log("\nLoops should now recognise those property names. Re-run:");
  console.log(`  node email-templates/push.mjs --apply ${eventName}`);
}

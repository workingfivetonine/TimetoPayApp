// Pushes an LMX file to Loops and emails you a test, so you can actually SEE
// whether LMX can carry our email design before porting all ten templates.
//
//   LOOPS_API_KEY=xxx node scripts/src/lmx-preview.mjs you@example.com
//   LOOPS_API_KEY=xxx node scripts/src/lmx-preview.mjs you@example.com path/to/other.lmx
//
// Safe by construction: it creates a BRAND NEW draft campaign every run and
// writes only into that. It never touches an existing campaign, never publishes,
// and never sends to anyone but the address you pass. Delete the draft campaign
// in Loops afterwards.
//
// Why a script and not curl: the content update needs an `expectedRevisionId`
// that has to come from the campaign-creation response, so it's a three-call
// sequence with state threaded between the calls.

import { readFileSync } from "node:fs";

const BASE = "https://app.loops.so/api/v1";
const KEY = process.env.LOOPS_API_KEY?.trim();
const to = process.argv[2];
const lmxPath = process.argv[3] ?? "email-templates/_lmx-experiment/welcome.lmx";

if (!KEY) {
  console.error("ERROR: set LOOPS_API_KEY. Get one from Loops > Settings > API.\n");
  console.error("  Windows PowerShell:  $env:LOOPS_API_KEY=\"your_key\"; node scripts/src/lmx-preview.mjs you@example.com");
  console.error("  Git Bash:            LOOPS_API_KEY=your_key node scripts/src/lmx-preview.mjs you@example.com");
  process.exit(1);
}
if (!to || !to.includes("@")) {
  console.error("ERROR: pass the email address to send the test to.");
  console.error("  node scripts/src/lmx-preview.mjs you@example.com");
  process.exit(1);
}

let lmx;
try {
  lmx = readFileSync(lmxPath, "utf8");
} catch {
  console.error(`ERROR: could not read ${lmxPath}`);
  process.exit(1);
}

if (lmx.includes("LOOPS_HOSTED_LOGO_URL")) {
  console.log("NOTE: the logo src is still the LOOPS_HOSTED_LOGO_URL placeholder.");
  console.log("      Expect a broken image. Everything else still renders, which is");
  console.log("      what this test is for. Upload the logo via Loops and swap the");
  console.log("      URL in if you want the full picture.\n");
}

// Every response is printed on failure. The point is to learn the API's actual
// contract rather than guess at it a second time.
async function call(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = null; }
  if (!res.ok) {
    console.error(`\nFAILED  ${method} ${path}  -> HTTP ${res.status}`);
    console.error(text || "(empty response body)");
    process.exit(1);
  }
  return json ?? {};
}

const stamp = new Date().toISOString().replace("T", " ").slice(0, 16);

console.log(`Using ${lmxPath}\n`);

// 1 ─ create a throwaway draft campaign. Only `name` is required, and the
// response carries both IDs the next call needs.
console.log("1/3  creating a draft campaign...");
const campaign = await call("POST", "/campaigns", { name: `LMX test ${stamp}` });
const emailMessageId = campaign.emailMessageId;
const revisionId = campaign.emailMessageContentRevisionId;
console.log(`     campaign:      ${campaign.id ?? "(no id returned)"}`);
console.log(`     emailMessage:  ${emailMessageId}`);
if (!emailMessageId || !revisionId) {
  console.error("\nERROR: response did not include emailMessageId / emailMessageContentRevisionId.");
  console.error(JSON.stringify(campaign, null, 2));
  process.exit(1);
}

// 2 ─ write the LMX into that draft message.
console.log("\n2/3  pushing the LMX...");
await call("POST", `/email-messages/${emailMessageId}`, {
  expectedRevisionId: revisionId,
  subject: "LMX test — TimetoPay",
  previewText: "Checking whether LMX can carry our design.",
  lmx,
});
console.log("     content updated");

// 3 ─ email it. The exact field name here is the one thing the docs don't
// specify, so try the likely shapes and report what the API says.
console.log(`\n3/3  sending a preview to ${to}...`);
const shapes = [{ emails: [to] }, { email: to }, { to: [to] }, { addresses: [to] }];
let sent = false;
for (const shape of shapes) {
  const res = await fetch(`${BASE}/email-messages/${emailMessageId}/preview`, {
    method: "POST",
    headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(shape),
  });
  const text = await res.text();
  if (res.ok) {
    console.log(`     sent (request shape: ${JSON.stringify(shape)})`);
    sent = true;
    break;
  }
  console.log(`     ${JSON.stringify(shape)} -> HTTP ${res.status} ${text.slice(0, 160)}`);
}

if (!sent) {
  console.error("\nCould not send the preview automatically. The content IS pushed though,");
  console.error(`so open the "LMX test ${stamp}" campaign in Loops and preview it there.`);
  process.exit(1);
}

console.log(`\nDone. Check ${to}.`);
console.log(`Then delete the "LMX test ${stamp}" draft campaign in Loops.`);

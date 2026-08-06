// Pushes the built LMX templates into Loops.
//
//   node email-templates/build.mjs                      # build first
//   LOOPS_API_KEY=xxx node email-templates/push.mjs     # dry run, shows the plan
//   LOOPS_API_KEY=xxx node email-templates/push.mjs --apply
//   LOOPS_API_KEY=xxx node email-templates/push.mjs --apply welcome weekly_summary
//
// Dry run by default. Nothing is written to Loops without --apply.
//
// HOW IT FINDS WHAT TO UPDATE
// There is no endpoint that lists email messages directly, so the ids are
// discovered by walking the workflow graph:
//
//   GET /v1/workflows                      -> every workflow (Loop)
//   GET /v1/workflows/{id}                 -> its nodes
//   GET /v1/workflow-nodes/{nodeId}        -> emailMessageId, for SendEmailAction
//   POST /v1/email-messages/{id}           -> write subject + LMX
//
// Matching a local template to a workflow is by name: the workflow's name must
// contain the template key, or the human name in NAME_HINTS. Anything unmatched
// is reported rather than guessed at.
//
// The announce_2_0 campaign is deliberately excluded. Campaigns are one-shot
// sends, so pushing content into an already-sent campaign is meaningless and
// re-running would risk writing into the wrong one. Use
// scripts/src/lmx-preview.mjs to build that as a fresh draft.

import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const DIST = join(HERE, "dist");
const BASE = "https://app.loops.so/api/v1";

const KEY = process.env.LOOPS_API_KEY?.trim();
const apply = process.argv.includes("--apply");
const only = process.argv.slice(2).filter((a) => !a.startsWith("--"));

if (!KEY) {
  console.error("ERROR: set LOOPS_API_KEY (Loops > Settings > API).");
  console.error('  PowerShell:  $env:LOOPS_API_KEY="key"; node email-templates/push.mjs');
  console.error("  Git Bash:    LOOPS_API_KEY=key node email-templates/push.mjs");
  process.exit(1);
}
if (!existsSync(join(DIST, "manifest.json"))) {
  console.error("ERROR: no dist/manifest.json. Run: node email-templates/build.mjs");
  process.exit(1);
}

// Where a workflow is named for the human-readable email rather than the event
// key. Extend as needed; unmatched templates are listed, never guessed.
const NAME_HINTS = {
  welcome: ["welcome"],
  account_deleted: ["account deleted", "deleted"],
  list_export_ready: ["shopping list", "list export"],
  receipt_inactivity: ["inactivity", "haven't scanned", "havent scanned"],
  weekly_summary: ["weekly"],
  monthly_summary: ["monthly"],
  preferences_updated: ["preferences"],
  password_reset_required: ["password"],
  trip_receipt_missing: ["trip", "keep the receipt", "receipt missing"],
};

async function api(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  if (!res.ok) {
    const err = new Error(`${method} ${path} -> HTTP ${res.status}`);
    err.detail = text;
    throw err;
  }
  return json ?? {};
}

const manifest = JSON.parse(readFileSync(join(DIST, "manifest.json"), "utf8"));
const targets = manifest
  .filter((m) => m.kind === "workflow")
  .filter((m) => !only.length || only.includes(m.key));

const campaigns = manifest.filter((m) => m.kind === "campaign");

if (!targets.length) {
  console.error("Nothing to push. Check the template keys you passed.");
  process.exit(1);
}

console.log(apply ? "APPLY mode: changes will be written.\n" : "DRY RUN: nothing will be written. Add --apply to push.\n");

// Response envelopes are inconsistent across Loops endpoints, so unwrap
// defensively and say so when nothing is found rather than reporting a silent
// zero that looks like "you have no emails".
function unwrap(res) {
  if (Array.isArray(res)) return res;
  for (const k of ["data", "workflows", "items", "results", "transactionalEmails", "campaigns"]) {
    if (Array.isArray(res?.[k])) return res[k];
  }
  return [];
}

const debug = process.argv.includes("--debug");

// ── discover workflows and their email nodes ─────────────────────────────────
console.log("Discovering workflows...");
let workflows;
try {
  const list = await api("GET", "/workflows?limit=100");
  workflows = unwrap(list);
  if (!workflows.length) {
    console.log("  none returned. Raw response, so we can see what shape it actually is:");
    console.log(`  ${JSON.stringify(list).slice(0, 600)}`);
    // The templates may not live in workflows at all. When the MJML zips were
    // uploaded they could have been created as transactional emails or as
    // individual campaigns, so check those too before giving up.
    for (const [label, path] of [
      ["transactional emails", "/transactional-emails?limit=100"],
      ["campaigns", "/campaigns?limit=100"],
    ]) {
      try {
        const alt = await api("GET", path);
        const rows = unwrap(alt);
        console.log(`\n  ${label}: ${rows.length} found`);
        for (const r of rows.slice(0, 25)) {
          const name = r.name ?? r.subject ?? r.title ?? "(unnamed)";
          const ids = [r.id, r.draftEmailMessageId, r.emailMessageId].filter(Boolean).join(" / ");
          console.log(`    "${name}"  ${ids}`);
        }
        if (debug) console.log(`    raw: ${JSON.stringify(alt).slice(0, 600)}`);
      } catch (e) {
        console.log(`  ${label}: could not read (${e.message})`);
      }
    }
    console.log(
      "\n  If your emails are listed under transactional emails or campaigns rather\n" +
        "  than workflows, tell me and I'll point the push at the right endpoint.",
    );
  }
} catch (e) {
  console.error(`  ${e.message}\n  ${e.detail ?? ""}`);
  process.exitCode = 1;
  workflows = [];
}
console.log(`  found ${workflows.length} workflow(s)`);

// For each workflow, collect its SendEmailAction nodes.
const emailNodes = [];
for (const wf of workflows) {
  const wfId = wf.id ?? wf.workflowId;
  const wfName = wf.name ?? "(unnamed)";
  let graph;
  try {
    graph = await api("GET", `/workflows/${wfId}`);
  } catch {
    console.log(`  skipped ${wfName}: could not read graph`);
    continue;
  }
  // The graph's nodes may arrive as an array OR as an object keyed by node id,
  // depending on the endpoint. Normalise before touching it: assuming an array
  // here is what threw "nodes.find is not a function".
  const rawNodes = graph.nodes ?? graph.data?.nodes ?? graph.workflow?.nodes ?? [];
  const nodes = Array.isArray(rawNodes)
    ? rawNodes
    : typeof rawNodes === "object" && rawNodes !== null
      ? Object.entries(rawNodes).map(([id, v]) => ({ id, ...(v ?? {}) }))
      : [];

  if (debug || !nodes.length) {
    console.log(`  ${wfName}: ${nodes.length} node(s)`);
    if (!nodes.length) console.log(`    raw graph: ${JSON.stringify(graph).slice(0, 400)}`);
  }

  // The trigger node names the event the app fires, which is the reliable way to
  // identify which template belongs here. Field name isn't documented, so check
  // the plausible ones.
  const trigger = nodes.find((n) => /Trigger/i.test(n.typeName ?? n.type ?? ""));
  let eventName =
    trigger?.eventName ?? trigger?.event ?? trigger?.eventKey ?? trigger?.name ?? null;
  if (!eventName && trigger) {
    try {
      const full = await api("GET", `/workflow-nodes/${trigger.id ?? trigger.nodeId}`);
      eventName = full.eventName ?? full.event ?? full.eventKey ?? null;
      if (debug) console.log(`    trigger node raw: ${JSON.stringify(full).slice(0, 300)}`);
    } catch { /* fall back to name matching */ }
  }

  for (const n of nodes) {
    if ((n.typeName ?? n.type) !== "SendEmailAction") continue;
    const nodeId = n.id ?? n.nodeId;
    // The graph view is simplified; the node endpoint is what carries
    // emailMessageId. Fall back to the graph value if it happens to be there.
    let emailMessageId = n.emailMessageId ?? null;
    if (!emailMessageId && nodeId) {
      try {
        const full = await api("GET", `/workflow-nodes/${nodeId}`);
        emailMessageId = full.emailMessageId ?? null;
      } catch { /* reported below as unmatched */ }
    }
    if (emailMessageId) emailNodes.push({ wfName, wfId, emailMessageId, eventName });
  }
}
console.log(`  found ${emailNodes.length} email node(s)\n`);

// ── match templates to email nodes ───────────────────────────────────────────
// Prefer the TRIGGER EVENT NAME: it is exactly the template key the app fires,
// so matching on it is exact rather than guesswork. Display names are a fallback
// for when the trigger's event isn't exposed in the graph.
function match(key) {
  const byEvent = emailNodes.filter((n) => n.eventName && n.eventName === key);
  if (byEvent.length) return { hits: byEvent, how: "trigger event" };

  const hints = [key, key.replace(/_/g, " "), ...(NAME_HINTS[key] ?? [])];
  const byName = emailNodes.filter((n) =>
    hints.some((h) => n.wfName.toLowerCase().includes(h.toLowerCase())),
  );
  return { hits: byName, how: "workflow name" };
}

const plan = [];
const unmatched = [];
const ambiguous = [];

for (const t of targets) {
  const { hits, how } = match(t.key);
  if (hits.length === 1) plan.push({ ...t, ...hits[0], how });
  else if (hits.length === 0) unmatched.push(t);
  else ambiguous.push({ ...t, hits });
}

for (const p of plan) {
  console.log(`  ${p.key.padEnd(24)} -> "${p.wfName}"  via ${p.how}  (${p.emailMessageId})`);
}
for (const u of unmatched) {
  console.log(`  ${u.key.padEnd(24)} -> NO MATCHING WORKFLOW`);
}
for (const a of ambiguous) {
  console.log(`  ${a.key.padEnd(24)} -> AMBIGUOUS: ${a.hits.map((h) => `"${h.wfName}"`).join(", ")}`);
}

if (unmatched.length || ambiguous.length) {
  console.log("\nWorkflow names Loops reported, to help fix NAME_HINTS:");
  for (const n of emailNodes) console.log(`  "${n.wfName}"`);
}

if (campaigns.length) {
  console.log(`\nSkipping ${campaigns.length} campaign template(s): ${campaigns.map((c) => c.key).join(", ")}`);
  console.log("  Campaigns are one-shot sends. Use scripts/src/lmx-preview.mjs to draft one.");
}

// Exit by setting process.exitCode and letting the script finish, NOT via
// process.exit(). fetch keeps its sockets alive briefly, and tearing the process
// down mid-flight trips a libuv assertion on Windows:
//   Assertion failed: !(handle->flags & UV_HANDLE_CLOSING), src\win\async.c
// That looked like a crash but was only the exit path.
if (!apply) {
  console.log(`\nDry run complete. ${plan.length} would be updated. Re-run with --apply.`);
  if (unmatched.length || ambiguous.length) process.exitCode = 1;
} else {
  // ── apply ──────────────────────────────────────────────────────────────────
  console.log("\nPushing...");
  let ok = 0;
  let failed = 0;
  for (const p of plan) {
    const lmx = readFileSync(join(DIST, `${p.key}.lmx`), "utf8");
    try {
      // Optimistically concurrent: fetch the current revision id first, or the
      // write is rejected with a 409.
      const current = await api("GET", `/email-messages/${p.emailMessageId}`);
      const revision = current.contentRevisionId ?? current.revisionId;
      if (!revision) {
        throw Object.assign(new Error("no contentRevisionId in GET response"), {
          detail: JSON.stringify(current),
        });
      }

      await api("POST", `/email-messages/${p.emailMessageId}`, {
        expectedRevisionId: revision,
        subject: p.subject,
        previewText: p.previewText,
        lmx,
      });
      console.log(`  ok    ${p.key}`);
      ok++;
    } catch (e) {
      console.log(`  FAIL  ${p.key}: ${e.message}`);
      if (e.detail) console.log(`        ${String(e.detail).slice(0, 300)}`);
      failed++;
    }
  }

  console.log(`\n${ok} updated, ${failed} failed.`);
  if (failed) process.exitCode = 1;
  else console.log("Publish each Loop in the Loops dashboard for the changes to go live.");
}

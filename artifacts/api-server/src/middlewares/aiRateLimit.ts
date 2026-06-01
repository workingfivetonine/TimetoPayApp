import type { Request, Response, NextFunction } from "express";

// Abuse controls for the expensive, AI-backed receipt-processing endpoints.
//
// The threat model assumes a PUBLIC deployment where throwaway authenticated
// accounts can drive billable OpenAI calls and local PDF rendering. Auth alone
// is not an abuse control, so every model-backed route is wrapped with this
// guard which enforces, per authenticated user:
//   - a short-window request rate limit (burst control),
//   - a rolling daily quota (sustained-spend control),
//   - a concurrency cap (no parallel fan-out from one account),
// plus a process-wide concurrency cap as global backpressure so one or many
// users cannot saturate the worker. Limits are intentionally generous for a
// human scanning receipts but make scripted abuse ineffective.
//
// State is in-memory (per process). The deployment is single-instance, so this
// is sufficient; if it is ever horizontally scaled these counters would need a
// shared store, but in-memory still provides per-instance protection.

export interface AiGuardOptions {
  /** Sliding fixed-window length for the burst limit, in ms. */
  windowMs: number;
  /** Max accepted requests per user within `windowMs`. */
  maxPerWindow: number;
  /** Max accepted requests per user within a rolling 24h day. */
  dailyMax: number;
  /** Max concurrent in-flight guarded requests per user. */
  maxConcurrentPerUser: number;
  /** Max concurrent in-flight guarded requests across all users. */
  maxConcurrentGlobal: number;
  /** Optional request-body field to size-check (e.g. "imageBase64"). */
  bodyField?: string;
  /** Max allowed length (chars) of the base64 `bodyField`, if set. */
  maxBodyChars?: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

interface Window {
  count: number;
  resetAt: number;
}

const windowCounts = new Map<string, Window>();
const dayCounts = new Map<string, Window>();
const userConcurrency = new Map<string, number>();
let globalConcurrency = 0;

// Process-wide daily budget across ALL users and all guarded endpoints. Per-user
// limits don't stop the threat model's named exploit — registering many throwaway
// accounts and looping requests — so this caps total model calls/day regardless
// of how many accounts an attacker controls. Tunable per deployment via
// AI_GLOBAL_DAILY_MAX (a normal numeric config var, not a secret); defaults to a
// generous ceiling that still bounds catastrophic Sybil spend.
function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}
const GLOBAL_DAILY_MAX = envInt("AI_GLOBAL_DAILY_MAX", 5000);
const globalDay: Window = { count: 0, resetAt: 0 };

function hitWindow(
  map: Map<string, Window>,
  key: string,
  now: number,
  windowMs: number,
  max: number,
): { ok: boolean; retryAfterMs: number } {
  const existing = map.get(key);
  if (!existing || existing.resetAt <= now) {
    map.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfterMs: 0 };
  }
  if (existing.count >= max) {
    return { ok: false, retryAfterMs: existing.resetAt - now };
  }
  existing.count += 1;
  return { ok: true, retryAfterMs: 0 };
}

function rollbackWindow(map: Map<string, Window>, key: string) {
  const existing = map.get(key);
  if (existing && existing.count > 0) existing.count -= 1;
}

// Periodically drop expired windows so the maps don't grow unbounded under a
// stream of distinct user ids. Unref'd so it never keeps the process alive.
const sweep = setInterval(() => {
  const now = Date.now();
  for (const [k, v] of windowCounts) if (v.resetAt <= now) windowCounts.delete(k);
  for (const [k, v] of dayCounts) if (v.resetAt <= now) dayCounts.delete(k);
  for (const [k, v] of userConcurrency) if (v <= 0) userConcurrency.delete(k);
}, 10 * 60 * 1000);
sweep.unref?.();

export function aiAbuseGuard(opts: AiGuardOptions) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const userId = req.userId;
    if (!userId) {
      // requireAuth runs before this; defensive only.
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    // 1) Payload size: reject oversized inputs before any model/render work.
    if (opts.bodyField && opts.maxBodyChars != null) {
      const raw = (req.body as Record<string, unknown> | undefined)?.[opts.bodyField];
      if (typeof raw === "string" && raw.length > opts.maxBodyChars) {
        res.status(413).json({ error: "Uploaded file is too large to process." });
        return;
      }
    }

    const now = Date.now();

    // 2) Global backpressure (checked first so we never reserve user slots for a
    // request the process can't run anyway).
    if (globalConcurrency >= opts.maxConcurrentGlobal) {
      res.setHeader("Retry-After", "5");
      res.status(429).json({ error: "Server is busy processing receipts. Please retry shortly." });
      return;
    }

    // 3) Per-user concurrency.
    const inFlight = userConcurrency.get(userId) ?? 0;
    if (inFlight >= opts.maxConcurrentPerUser) {
      res.setHeader("Retry-After", "5");
      res.status(429).json({ error: "Please wait for your current scan to finish before starting another." });
      return;
    }

    // The remaining checks all mutate counters on success. Because this runs
    // synchronously to next() with no awaits, no other request can interleave,
    // so check-then-increment is atomic; rollbacks only need to undo earlier
    // increments when a later gate rejects.

    // 4) Burst window.
    const w = hitWindow(windowCounts, userId, now, opts.windowMs, opts.maxPerWindow);
    if (!w.ok) {
      res.setHeader("Retry-After", String(Math.ceil(w.retryAfterMs / 1000)));
      res.status(429).json({ error: "Too many scans in a short time. Please slow down." });
      return;
    }

    // 5) Per-user daily quota.
    const d = hitWindow(dayCounts, userId, now, DAY_MS, opts.dailyMax);
    if (!d.ok) {
      rollbackWindow(windowCounts, userId); // don't let a quota rejection burn burst budget
      res.setHeader("Retry-After", String(Math.ceil(d.retryAfterMs / 1000)));
      res.status(429).json({ error: "Daily receipt-processing limit reached. Please try again tomorrow." });
      return;
    }

    // 6) Process-wide daily budget (Sybil/cross-account spend ceiling).
    if (globalDay.resetAt <= now) {
      globalDay.count = 0;
      globalDay.resetAt = now + DAY_MS;
    }
    if (globalDay.count >= GLOBAL_DAILY_MAX) {
      rollbackWindow(windowCounts, userId);
      rollbackWindow(dayCounts, userId);
      res.setHeader("Retry-After", String(Math.ceil((globalDay.resetAt - now) / 1000)));
      res.status(429).json({ error: "Receipt processing is temporarily unavailable due to high demand. Please try again later." });
      return;
    }
    globalDay.count += 1;

    // Admit: reserve concurrency and release exactly once when the response ends.
    globalConcurrency += 1;
    userConcurrency.set(userId, inFlight + 1);
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      globalConcurrency = Math.max(0, globalConcurrency - 1);
      const cur = userConcurrency.get(userId) ?? 1;
      if (cur <= 1) userConcurrency.delete(userId);
      else userConcurrency.set(userId, cur - 1);
    };
    res.on("finish", release);
    res.on("close", release);

    next();
  };
}

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
//
// Global daily budget (Sybil / cross-account spend ceiling)
// ─────────────────────────────────────────────────────────
// The process-wide daily budget is NOT incremented here in the middleware.
// It is instead charged lazily via chargeGlobalAiBudget() called by each route
// handler immediately before the actual OpenAI API call (and, for PDFs, in
// each branch after structural validation succeeds). This design ensures that:
//   - Requests rejected before reaching the model (missing field, wrong payload
//     type, malformed PDF structure, pdftoppm render failure, etc.) never
//     consume any global quota, closing the DoS primitive described in the
//     threat model.
//   - Only genuine model invocations count against the shared budget.

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
  /**
   * Required request-body field containing the base64 payload
   * (e.g. "imageBase64"). Presence, size, and structural magic bytes are all
   * validated before any counter is incremented.
   */
  bodyField?: string;
  /** Max allowed length (chars) of the base64 `bodyField`, if set. */
  maxBodyChars?: number;
  /**
   * Expected payload type. When set, the decoded header bytes of `bodyField`
   * are structurally validated before any quota counter is incremented so that
   * cheap junk payloads (forged magic bytes, trivially small blobs, etc.)
   * cannot exhaust per-user rate limits or concurrency slots.
   *
   * Validation is layered:
   *   1. Minimum decoded size (rules out magic-bytes-only micro payloads).
   *   2. Magic marker match.
   *   3. Structural header check beyond the marker (JPEG app marker,
   *      PNG IHDR chunk, GIF version bytes, BMP file-size field, etc.).
   */
  payloadType?: "image" | "pdf";
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

// Process-wide daily budget across ALL users and all guarded endpoints.
// Tunable per deployment via AI_GLOBAL_DAILY_MAX (a normal numeric config var,
// not a secret); defaults to a generous ceiling that bounds catastrophic Sybil
// spend.
function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}
const GLOBAL_DAILY_MAX = envInt("AI_GLOBAL_DAILY_MAX", 5000);
const globalDay: Window = { count: 0, resetAt: 0 };

/**
 * Check and increment the process-wide AI daily budget. Route handlers MUST
 * call this immediately before every OpenAI API call, in the branch that is
 * actually about to invoke the model. Returns true when the request is
 * admitted; returns false and sends a 429 when the budget is exhausted.
 *
 * Placing the charge at the exact model-call site (after all structural
 * validation) means only genuine AI invocations consume quota.
 */
export function chargeGlobalAiBudget(res: Response): boolean {
  const now = Date.now();
  if (globalDay.resetAt <= now) {
    globalDay.count = 0;
    globalDay.resetAt = now + DAY_MS;
  }
  if (globalDay.count >= GLOBAL_DAILY_MAX) {
    res.setHeader("Retry-After", String(Math.ceil((globalDay.resetAt - now) / 1000)));
    res.status(429).json({
      error: "Receipt processing is temporarily unavailable due to high demand. Please try again later.",
    });
    return false;
  }
  globalDay.count += 1;
  return true;
}

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

// Decode just enough base64 characters to read the first `byteCount` bytes of
// the payload. Returns null if the prefix contains non-base64 characters.
function decodeBase64Prefix(b64: string, byteCount: number): Buffer | null {
  // ceil(byteCount / 3) * 4 gives the minimum full base64 groups; add one
  // extra group as a buffer so we always decode enough bytes.
  const charsNeeded = (Math.ceil(byteCount / 3) + 1) * 4;
  const sample = b64.slice(0, charsNeeded);
  if (!/^[A-Za-z0-9+/=]+$/.test(sample)) return null;
  try {
    return Buffer.from(sample, "base64");
  } catch {
    return null;
  }
}

// Minimum decoded payload sizes. These ensure that a forged magic-byte prefix
// (e.g., 3 bytes of JPEG SOI + padding) cannot pass the structural checks —
// a real receipt photo or PDF will always exceed these floors.
//
//   Image: 1 KB — the smallest conceivable real image (1×1 JPEG ≈ 107 bytes,
//          but a scannable receipt photo is tens of KB minimum). 1 KB is a
//          conservative floor that blocks magic-byte-only micro-blobs.
//   PDF:   512 bytes — the absolute minimum structurally valid PDF is ~100
//          bytes, but a receipt PDF with any content is larger. 512 bytes
//          gives a reasonable margin while avoiding false-positives.
const MIN_IMAGE_DECODED_BYTES = 1024;
const MIN_PDF_DECODED_BYTES = 512;

/**
 * Validate that the base64 payload field is structurally consistent with the
 * expected file type. Checks are layered:
 *   1. Approximate decoded size >= minimum floor (blocks micro-payloads).
 *   2. Magic marker match (first 2–8 bytes).
 *   3. Structural header bytes beyond the marker (JPEG app marker type,
 *      PNG IHDR chunk header, GIF version string, BMP file-size field).
 *
 * Only a small prefix is decoded — this is cheap and runs before any counter
 * is incremented.
 */
function validatePayloadStructure(
  b64: string,
  type: "image" | "pdf",
): { ok: boolean; error: string } {
  const minDecoded = type === "image" ? MIN_IMAGE_DECODED_BYTES : MIN_PDF_DECODED_BYTES;

  // Step 1: approximate decoded size from base64 length (4 base64 chars → 3 bytes).
  // Subtract padding chars so the estimate is tight regardless of padding style.
  const approxDecoded = Math.floor((b64.replace(/=/g, "").length * 3) / 4);
  if (approxDecoded < minDecoded) {
    return {
      ok: false,
      error: "Invalid payload: file is too small to be a real receipt.",
    };
  }

  // Step 2 + 3: decode enough bytes for structural header validation.
  // 24 bytes covers the deepest check (PNG IHDR starts at byte 8, chunk
  // data ends at byte 8+4+4=16; we read to 24 for safety margin).
  const HEADER_BYTES = 24;
  const bytes = decodeBase64Prefix(b64, HEADER_BYTES);
  if (!bytes || bytes.length < 4) {
    return { ok: false, error: "Invalid payload: could not decode." };
  }

  if (type === "pdf") {
    // %PDF- (25 50 44 46)
    if (
      bytes[0] === 0x25 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x44 &&
      bytes[3] === 0x46
    ) {
      return { ok: true, error: "" };
    }
    return { ok: false, error: "Invalid payload: not a PDF file." };
  }

  // type === "image"

  // JPEG: SOI (FF D8), then a valid JPEG segment marker (FF <marker>).
  // Marker byte must be a recognized JPEG segment type — rules out SOI + random byte.
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    const marker = bytes[3];
    // APP0–APP15, DQT, SOF0, SOF2, DHT, DRI, COM, SOF1, SOF3, SOF5–SOF7, SOF9–SOF11, SOF13–SOF15
    const isValidJpegMarker =
      (marker >= 0xe0 && marker <= 0xef) || // APP0–APP15
      marker === 0xdb || // DQT (quantization table)
      marker === 0xc0 || marker === 0xc1 || marker === 0xc2 || marker === 0xc3 || // SOF0–SOF3
      marker === 0xc4 || // DHT (huffman table)
      marker === 0xc5 || marker === 0xc6 || marker === 0xc7 || // SOF5–SOF7
      marker === 0xc9 || marker === 0xca || marker === 0xcb || // SOF9–SOF11
      marker === 0xcd || marker === 0xce || marker === 0xcf || // SOF13–SOF15
      marker === 0xdd || // DRI
      marker === 0xfe; // COM
    if (isValidJpegMarker) return { ok: true, error: "" };
    return { ok: false, error: "Invalid payload: not a recognized image file." };
  }

  // PNG: 8-byte signature (89 50 4E 47 0D 0A 1A 0A), then IHDR chunk.
  // IHDR length must be exactly 13 (0x0000000D) and chunk type must be "IHDR".
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
    bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
  ) {
    if (
      bytes.length >= 16 &&
      bytes[8] === 0x00 && bytes[9] === 0x00 && bytes[10] === 0x00 && bytes[11] === 0x0d &&
      bytes[12] === 0x49 && bytes[13] === 0x48 && bytes[14] === 0x44 && bytes[15] === 0x52
    ) {
      return { ok: true, error: "" };
    }
    return { ok: false, error: "Invalid payload: not a recognized image file." };
  }

  // GIF: GIF87a (47 49 46 38 37 61) or GIF89a (47 49 46 38 39 61).
  if (
    bytes.length >= 6 &&
    bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38 &&
    (bytes[4] === 0x37 || bytes[4] === 0x39) && bytes[5] === 0x61
  ) {
    return { ok: true, error: "" };
  }

  // WebP: RIFF (52 49 46 46) at bytes 0-3, WEBP (57 45 42 50) at bytes 8-11.
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) {
    return { ok: true, error: "" };
  }

  // BMP: "BM" (42 4D) + 32-bit file size at bytes 2-5 (little-endian, must be > 0).
  if (bytes.length >= 6 && bytes[0] === 0x42 && bytes[1] === 0x4d) {
    const fileSize =
      bytes[2] | (bytes[3] << 8) | (bytes[4] << 16) | (bytes[5] << 24);
    if (fileSize > 0) return { ok: true, error: "" };
    return { ok: false, error: "Invalid payload: not a recognized image file." };
  }

  // TIFF little-endian: II*\0 (49 49 2A 00).
  if (bytes[0] === 0x49 && bytes[1] === 0x49 && bytes[2] === 0x2a && bytes[3] === 0x00) {
    return { ok: true, error: "" };
  }

  // TIFF big-endian: MM\0* (4D 4D 00 2A).
  if (bytes[0] === 0x4d && bytes[1] === 0x4d && bytes[2] === 0x00 && bytes[3] === 0x2a) {
    return { ok: true, error: "" };
  }

  // HEIC/HEIF: ISO Base Media File Format — "ftyp" box type at bytes 4-7
  // (66 74 79 70). The 4-byte box size at bytes 0-3 can vary.
  if (
    bytes.length >= 8 &&
    bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70
  ) {
    return { ok: true, error: "" };
  }

  return { ok: false, error: "Invalid payload: not a recognized image file." };
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

    // 1) Payload validation: all checks run BEFORE any counter is incremented.
    //    This prevents cheap or invalid requests from consuming per-user quota
    //    or concurrency slots.
    //
    //    a) Presence: reject if the required field is absent or not a non-empty
    //       string — catches `{}` or `{field: 42}` style abuse.
    //    b) Size: reject oversized payloads (413) before any counter work.
    //    c) Structural payload check: validates minimum decoded size, magic
    //       marker, AND structural header bytes beyond the marker — blocks both
    //       missing payloads and forged-magic-byte micro/junk blobs before any
    //       per-user quota is touched.
    //
    //    NOTE: the process-wide global daily budget is NOT checked here. It is
    //    charged by chargeGlobalAiBudget() in each route handler, immediately
    //    before the OpenAI call and after all structural validation, so that
    //    only genuine model invocations count against the shared ceiling.
    if (opts.bodyField) {
      const raw = (req.body as Record<string, unknown> | undefined)?.[opts.bodyField];
      if (typeof raw !== "string" || raw.length === 0) {
        res.status(400).json({ error: `Missing required field: ${opts.bodyField}` });
        return;
      }
      if (opts.maxBodyChars != null && raw.length > opts.maxBodyChars) {
        res.status(413).json({ error: "Uploaded file is too large to process." });
        return;
      }
      if (opts.payloadType) {
        const check = validatePayloadStructure(raw, opts.payloadType);
        if (!check.ok) {
          res.status(400).json({ error: check.error });
          return;
        }
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

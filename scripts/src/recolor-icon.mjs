// Recolours the TimetoPay icon artwork from the old violet to the new dark teal,
// and regenerates the two derived icons that were already broken.
//
//   node scripts/src/recolor-icon.mjs --check     # report only, write nothing
//   node scripts/src/recolor-icon.mjs             # rewrite the assets
//
// WHAT IT DOES
// Recolour: converts each pixel to HSL and only touches pixels whose hue is in
// the violet window and that are saturated enough to be brand colour. The white
// glyph (saturation ~0) and the lockup's slate wordmark (hue outside the window)
// pass through untouched, so no masking is needed.
//
// Lightness is remapped through a curve anchored at white, NOT a plain linear
// stretch. A linear stretch darkens the anti-aliased pixels around the glyph
// (they are violet-tinted but nearly white) and leaves a dark fringe on every
// edge. Here the body of the gradient is remapped to the target range while
// anything lighter than the body rolls off smoothly to pure white.
//
// Regenerate: apple-touch-icon.png and icon-maskable-512.png were already
// degraded before any recolouring — both had a washed-out, near-invisible glyph
// instead of a crisp white one. Recolouring those would just yield broken teal
// icons, so they are rebuilt from the 1024px master by area-average downscale.

import { deflateSync, inflateSync } from "node:zlib";
import { readFileSync, writeFileSync } from "node:fs";

// ── colour space ─────────────────────────────────────────────────────────────
function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return [h * 360, s, l];
}

function hslToRgb(h, s, l) {
  h = ((h % 360) + 360) % 360 / 360;
  if (s === 0) { const v = Math.round(l * 255); return [v, v, v]; }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hue = (t) => {
    t = (t + 1) % 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [
    Math.round(hue(h + 1 / 3) * 255),
    Math.round(hue(h) * 255),
    Math.round(hue(h - 1 / 3) * 255),
  ];
}

// ── PNG codec (8-bit RGB/RGBA, non-interlaced) ───────────────────────────────
const CRC_T = (() => {
  const t = new Int32Array(256);
  for (let i = 0; i < 256; i++) { let c = i; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[i] = c; }
  return t;
})();
const crc32 = (b) => { let c = -1; for (let i = 0; i < b.length; i++) c = CRC_T[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ -1) >>> 0; };

const paeth = (a, b, c) => {
  const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
};

function decode(buf) {
  let i = 8; const chunks = [];
  while (i < buf.length) {
    const len = buf.readUInt32BE(i);
    const type = buf.slice(i + 4, i + 8).toString("latin1");
    chunks.push({ type, data: buf.slice(i + 8, i + 8 + len) });
    i += 12 + len;
    if (type === "IEND") break;
  }
  const ihdr = chunks.find((c) => c.type === "IHDR").data;
  const width = ihdr.readUInt32BE(0), height = ihdr.readUInt32BE(4);
  const depth = ihdr[8], colorType = ihdr[9], interlace = ihdr[12];
  if (depth !== 8 || interlace !== 0 || (colorType !== 2 && colorType !== 6)) {
    throw new Error(`unsupported PNG (depth=${depth} color=${colorType} interlace=${interlace})`);
  }
  const channels = colorType === 6 ? 4 : 3;
  const raw = inflateSync(Buffer.concat(chunks.filter((c) => c.type === "IDAT").map((c) => c.data)));
  const stride = width * channels;
  const px = Buffer.alloc(height * stride);
  let pos = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[pos++];
    const line = raw.slice(pos, pos + stride); pos += stride;
    const cur = px.slice(y * stride, (y + 1) * stride);
    const prev = y > 0 ? px.slice((y - 1) * stride, y * stride) : Buffer.alloc(stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? cur[x - channels] : 0;
      const b = prev[x];
      const c = x >= channels ? prev[x - channels] : 0;
      const v = line[x];
      cur[x] = (filter === 0 ? v : filter === 1 ? v + a : filter === 2 ? v + b
        : filter === 3 ? v + ((a + b) >> 1) : v + paeth(a, b, c)) & 0xff;
    }
  }
  return { width, height, channels, px };
}

function encode({ width, height, channels, px }) {
  const stride = width * channels;
  const raw = Buffer.alloc(height * (stride + 1));
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter: None
    px.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const chunk = (type, data) => {
    const b = Buffer.alloc(12 + data.length);
    b.writeUInt32BE(data.length, 0);
    b.write(type, 4, "latin1");
    data.copy(b, 8);
    b.writeUInt32BE(crc32(b.slice(4, 8 + data.length)), 8 + data.length);
    return b;
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = channels === 4 ? 6 : 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("sRGB", Buffer.from([0])),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// Area-average downscale — right filter for shrinking an icon; keeps the glyph
// edges smooth instead of the aliasing a nearest-neighbour pick would give.
function resize(img, outW, outH) {
  const { width: w, height: h, channels: n, px } = img;
  const out = Buffer.alloc(outW * outH * n);
  for (let y = 0; y < outH; y++) {
    const sy0 = (y * h) / outH, sy1 = ((y + 1) * h) / outH;
    for (let x = 0; x < outW; x++) {
      const sx0 = (x * w) / outW, sx1 = ((x + 1) * w) / outW;
      const acc = new Float64Array(n);
      let wsum = 0;
      for (let sy = Math.floor(sy0); sy < Math.ceil(sy1); sy++) {
        const fy = Math.min(sy + 1, sy1) - Math.max(sy, sy0);
        for (let sx = Math.floor(sx0); sx < Math.ceil(sx1); sx++) {
          const fx = Math.min(sx + 1, sx1) - Math.max(sx, sx0);
          const wgt = fy * fx;
          if (wgt <= 0) continue;
          const i = (sy * w + sx) * n;
          // Weight colour by alpha so transparent pixels don't drag in black.
          const a = n === 4 ? px[i + 3] / 255 : 1;
          for (let c = 0; c < 3; c++) acc[c] += px[i + c] * wgt * a;
          if (n === 4) acc[3] += px[i + 3] * wgt;
          wsum += wgt * (n === 4 ? a : 1);
        }
      }
      const o = (y * outW + x) * n;
      const denom = wsum || 1;
      for (let c = 0; c < 3; c++) out[o + c] = Math.round(Math.min(255, acc[c] / denom));
      if (n === 4) {
        const area = (sy1 - sy0) * (sx1 - sx0);
        out[o + 3] = Math.round(Math.min(255, acc[3] / (area || 1)));
      }
    }
  }
  return { width: outW, height: outH, channels: n, px: out };
}

// ── recolour ─────────────────────────────────────────────────────────────────
// Measured from the original artwork rather than guessed, because the three
// elements sit close together in hue and a loose window mangles the wordmark:
//   icon glyph background  hue 259-260, saturation 1.00
//   "TimetoPay" wordmark   hue 229-240, saturation 0.28   <- must NOT change
//   "KEEP THE RECEIPT"     hue 254,     saturation 0.15
// A window starting at 235 clipped the top of the wordmark's range and left it
// visibly mottled. 250 clears it with margin while still covering the icon.
const HUE_MIN = 250, HUE_MAX = 275;
// Kept low on purpose: the anti-aliased pixels around the glyph are barely
// saturated, and they still need recolouring or the glyph keeps a violet fringe.
const SAT_MIN = 0.10;
const TARGET_HUE = 192;               // teal, matching app primary #04576A
const OUT_L_MIN = 0.10;               // dark corner of the new gradient
const OUT_L_MAX = 0.30;               // light corner

// Anti-aliased pixels around the white glyph are violet MIXED WITH WHITE, so
// their saturation is low while the gradient body stays highly saturated. That
// makes saturation — not lightness — the correct way to tell them apart:
// lightness can't distinguish "anti-aliasing" from "the light corner of the
// gradient", and keying the fade on lightness bleaches that corner into visible
// vertical banding. Below this saturation, fade toward white proportionally.
const AA_SAT = 0.40;

function percentile(sorted, p) {
  if (!sorted.length) return 0;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * p)));
  return sorted[i];
}

function recolour(img) {
  const { channels: n, px } = img;
  const ls = [];
  for (let i = 0; i < px.length; i += n) {
    if (n === 4 && px[i + 3] < 8) continue;
    const [h, s, l] = rgbToHsl(px[i], px[i + 1], px[i + 2]);
    if (s >= SAT_MIN && h >= HUE_MIN && h <= HUE_MAX) ls.push(l);
  }
  if (!ls.length) return { hits: 0 };
  ls.sort((a, b) => a - b);
  // Percentiles, not min/max: the extremes are anti-aliasing, not the gradient.
  const bodyLo = percentile(ls, 0.02);
  const bodyHi = percentile(ls, 0.98);
  const span = bodyHi - bodyLo || 1;

  let hits = 0;
  for (let i = 0; i < px.length; i += n) {
    if (n === 4 && px[i + 3] < 8) continue;
    const [h, s, l] = rgbToHsl(px[i], px[i + 1], px[i + 2]);
    if (s < SAT_MIN || h < HUE_MIN || h > HUE_MAX) continue;
    hits++;

    const t = Math.max(0, Math.min(1, (l - bodyLo) / span));
    let newL = OUT_L_MIN + t * (OUT_L_MAX - OUT_L_MIN);
    let newS = Math.min(0.95, s * 1.05);

    // Low saturation => this pixel is violet blended toward the white glyph.
    // Reproduce that same blend against the new teal so edges stay clean.
    if (s < AA_SAT) {
      const k = 1 - s / AA_SAT;          // 1 at pure white, 0 at full saturation
      newL = newL + (1 - newL) * k;
      newS = newS * (1 - k);
    }

    const [r, g, b] = hslToRgb(TARGET_HUE, newS, newL);
    px[i] = r; px[i + 1] = g; px[i + 2] = b;
  }
  return { hits, bodyLo, bodyHi };
}

// ── run ──────────────────────────────────────────────────────────────────────
const A = "artifacts/receipt-tracker";
const MASTER = `${A}/assets/images/icon.png`;   // 1024, crisp white glyph

// Recoloured in place at native size.
const RECOLOUR = [
  `${A}/assets/images/icon.png`,
  `${A}/assets/images/adaptive-icon.png`,
  `${A}/assets/images/favicon.png`,
  `${A}/assets/images/logo-lockup.png`,
  `${A}/public/icon-512.png`,
  `${A}/public/icon-192.png`,
  `${A}/public/icon.png`,
  `${A}/assets/pwa/icon-512.png`,
];

// Rebuilt from the recoloured master because the existing files are degraded.
const REGENERATE = [
  { path: `${A}/public/apple-touch-icon.png`, size: 180, why: "washed-out glyph" },
  { path: `${A}/public/icon-maskable-512.png`, size: 512, why: "glyph near-invisible" },
];

const checkOnly = process.argv.includes("--check");

for (const file of RECOLOUR) {
  let img;
  try { img = decode(readFileSync(file)); }
  catch (err) { console.log(`  SKIP     ${file}  (${err.message})`); continue; }
  const { hits, bodyLo, bodyHi } = recolour(img);
  if (!hits) { console.log(`  no-op    ${file}  (no violet found)`); continue; }
  const pct = ((hits / (img.px.length / img.channels)) * 100).toFixed(1);
  if (checkOnly) console.log(`  would    ${file}  ${img.width}x${img.height}  ${pct}%  body L ${bodyLo.toFixed(2)}-${bodyHi.toFixed(2)}`);
  else { writeFileSync(file, encode(img)); console.log(`  recolour ${file}  ${img.width}x${img.height}  ${pct}%`); }
}

// Regenerate the two broken derivatives from the master. By this point the
// recolour loop has already written the teal master to disk, so re-reading it
// gives the recoloured artwork — do NOT recolour again.
for (const { path, size, why } of REGENERATE) {
  if (checkOnly) { console.log(`  would    ${path}  regenerate ${size}x${size} from master (${why})`); continue; }
  const master = decode(readFileSync(MASTER));
  writeFileSync(path, encode(resize(master, size, size)));
  console.log(`  rebuild  ${path}  ${size}x${size} from master (${why})`);
}

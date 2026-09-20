// Generates the PWA icons in public/icons without any image dependencies.
// Draws a slate background with an emerald ring + dot (a "plate"), encodes it as PNG
// using Node's zlib, and also writes an SVG favicon with the same geometry.
//
//   node scripts/generate-icons.mjs

import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');

const BG = [15, 23, 42]; // #0f172a
const RING = [52, 211, 153]; // #34d399
const DOT = [16, 185, 129]; // #10b981

// Geometry as fractions of the icon size.
const RING_OUTER = 0.36;
const RING_INNER = 0.27;
const DOT_RADIUS = 0.11;

// ---------- PNG encoding ----------

const CRC_TABLE = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const b of bytes) crc = CRC_TABLE[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBytes = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])));
  return Buffer.concat([length, typeBytes, data, crc]);
}

function encodePng(size, rgb) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: RGB
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  // Each scanline is prefixed with filter byte 0 (None).
  const raw = Buffer.alloc(size * (size * 3 + 1));
  for (let y = 0; y < size; y += 1) {
    const rowStart = y * (size * 3 + 1);
    raw[rowStart] = 0;
    rgb.copy(raw, rowStart + 1, y * size * 3, (y + 1) * size * 3);
  }

  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------- Rasteriser ----------

function colourAt(dx, dy, size, scale) {
  const d = Math.hypot(dx, dy) / size;
  if (d <= DOT_RADIUS * scale) return DOT;
  if (d >= RING_INNER * scale && d <= RING_OUTER * scale) return RING;
  return BG;
}

/** Render the icon at `size` px. `scale` < 1 shrinks the artwork (used for maskable icons). */
function render(size, scale = 1) {
  const SS = 4; // supersampling factor per axis for anti-aliasing
  const rgb = Buffer.alloc(size * size * 3);
  const centre = size / 2;
  const samples = SS * SS;

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let r = 0;
      let g = 0;
      let b = 0;
      for (let sy = 0; sy < SS; sy += 1) {
        for (let sx = 0; sx < SS; sx += 1) {
          const px = x + (sx + 0.5) / SS - centre;
          const py = y + (sy + 0.5) / SS - centre;
          const c = colourAt(px, py, size, scale);
          r += c[0];
          g += c[1];
          b += c[2];
        }
      }
      const i = (y * size + x) * 3;
      rgb[i] = Math.round(r / samples);
      rgb[i + 1] = Math.round(g / samples);
      rgb[i + 2] = Math.round(b / samples);
    }
  }
  return encodePng(size, rgb);
}

function svg() {
  const s = 100;
  const c = s / 2;
  const hex = ([r, g, b]) => `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${s} ${s}">`,
    `<rect width="${s}" height="${s}" rx="22" fill="${hex(BG)}"/>`,
    `<circle cx="${c}" cy="${c}" r="${(RING_OUTER + RING_INNER) / 2 * s}" fill="none" stroke="${hex(RING)}" stroke-width="${(RING_OUTER - RING_INNER) * s}"/>`,
    `<circle cx="${c}" cy="${c}" r="${DOT_RADIUS * s}" fill="${hex(DOT)}"/>`,
    `</svg>`,
    '',
  ].join('\n');
}

// ---------- Output ----------

mkdirSync(OUT_DIR, { recursive: true });

const files = [
  ['icon-192.png', render(192)],
  ['icon-512.png', render(512)],
  // Maskable icons must keep artwork inside the central 80% "safe zone".
  ['icon-512-maskable.png', render(512, 0.8)],
  ['apple-touch-icon-180.png', render(180)],
  ['icon.svg', svg()],
];

for (const [name, data] of files) {
  writeFileSync(join(OUT_DIR, name), data);
  console.log(`wrote public/icons/${name} (${data.length} bytes)`);
}

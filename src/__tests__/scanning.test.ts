import { describe, expect, it } from 'vitest';
import { createReadConfirmer, fitWithin, reticleToVideoRect } from '../lib/scanning';
import { decodeRgba } from '../lib/zxingDecode';

describe('reticleToVideoRect', () => {
  const reticle = { x: 0.1, y: 0.3, width: 0.8, height: 0.4 };

  it('maps directly when video and viewport share an aspect ratio', () => {
    expect(reticleToVideoRect(800, 600, 400, 300, reticle, 0)).toEqual({ x: 80, y: 180, width: 640, height: 240 });
  });

  it('accounts for object-fit: cover cropping the sides of a wide video', () => {
    // 1280x720 into a 4:3 viewport: scaled to 533x300, 66.7px cut off each side.
    const rect = reticleToVideoRect(1280, 720, 400, 300, reticle, 0);
    expect(rect).toEqual({ x: 256, y: 216, width: 768, height: 288 });
  });

  it('accounts for cover cropping the top and bottom of a portrait video', () => {
    // 720x1280 (phone in portrait) into a 4:3 viewport: only a 720x540 band in the middle is visible.
    const rect = reticleToVideoRect(720, 1280, 400, 300, reticle, 0);
    expect(rect).toEqual({ x: 72, y: 532, width: 576, height: 216 });
  });

  it('clamps padding to the video frame', () => {
    const rect = reticleToVideoRect(800, 600, 400, 300, { x: 0, y: 0, width: 1, height: 1 }, 0.2);
    expect(rect).toEqual({ x: 0, y: 0, width: 800, height: 600 });
  });
});

describe('fitWithin', () => {
  it('scales down to the longest side', () => {
    expect(fitWithin(1600, 400, 800)).toEqual({ width: 800, height: 200 });
  });

  it('never scales up', () => {
    expect(fitWithin(300, 100, 800)).toEqual({ width: 300, height: 100 });
  });
});

describe('createReadConfirmer', () => {
  it('accepts immediately when one read is enough', () => {
    expect(createReadConfirmer().push('123', 0, 1)).toBe('123');
  });

  it('needs consecutive matching reads', () => {
    const c = createReadConfirmer();
    expect(c.push('111', 0, 2)).toBeNull();
    expect(c.push('222', 50, 2)).toBeNull();
    expect(c.push('222', 100, 2)).toBe('222');
  });

  it('forgets reads that are too far apart', () => {
    const c = createReadConfirmer(500);
    expect(c.push('111', 0, 2)).toBeNull();
    expect(c.push('111', 600, 2)).toBeNull();
    expect(c.push('111', 700, 2)).toBe('111');
  });

  it('starts over after reset', () => {
    const c = createReadConfirmer();
    c.push('111', 0, 2);
    c.reset();
    expect(c.push('111', 10, 2)).toBeNull();
  });
});

const EAN_L = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011'];
const EAN_PARITY = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL'];
const invert = (bits: string) => bits.replace(/./g, (b) => (b === '1' ? '0' : '1'));

/** EAN-13 bar pattern ('1' = dark module), built from the standard encoding tables. */
function ean13Modules(code: string): string {
  const digits = [...code].map(Number);
  const parity = EAN_PARITY[digits[0]];
  let bits = '101';
  digits.slice(1, 7).forEach((d, i) => {
    bits += parity[i] === 'L' ? EAN_L[d] : [...invert(EAN_L[d])].reverse().join('');
  });
  bits += '01010';
  digits.slice(7).forEach((d) => {
    bits += invert(EAN_L[d]);
  });
  return bits + '101';
}

/** Render an EAN-13 as RGBA pixels: dark bars on a light background with a quiet zone. */
function renderEan13(code: string, moduleWidth = 3, height = 80): { data: Uint8ClampedArray; width: number; height: number } {
  const modules = ean13Modules(code);
  const quiet = 12 * moduleWidth;
  const width = modules.length * moduleWidth + quiet * 2;
  const data = new Uint8ClampedArray(width * height * 4).fill(235);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const module = Math.floor((x - quiet) / moduleWidth);
      if (modules[module] !== '1') continue;
      const p = (y * width + x) * 4;
      data[p] = data[p + 1] = data[p + 2] = 20;
    }
  }
  return { data, width, height };
}

describe('decodeRgba', () => {
  it('reads an EAN-13 barcode', () => {
    const { data, width, height } = renderEan13('5000159484695');
    expect(decodeRgba(data, width, height)).toBe('5000159484695');
  });

  it('returns null for a frame without a barcode', () => {
    expect(decodeRgba(new Uint8ClampedArray(200 * 100 * 4).fill(128), 200, 100)).toBeNull();
  });
});

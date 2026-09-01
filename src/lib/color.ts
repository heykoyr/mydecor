/** Small colour helpers, shared by recommendation scoring and compositing. */

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export interface Hsl {
  /** Degrees, 0–360. */
  h: number;
  /** 0–1. */
  s: number;
  /** 0–1. */
  l: number;
}

export function hexToRgb(hex: string): Rgb | null {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match?.[1]) return null;
  const value = Number.parseInt(match[1], 16);
  return { r: (value >> 16) & 255, g: (value >> 8) & 255, b: value & 255 };
}

export function rgbToHsl({ r, g, b }: Rgb): Hsl {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;
  const l = (max + min) / 2;

  if (delta === 0) return { h: 0, s: 0, l };

  const s = delta / (1 - Math.abs(2 * l - 1));
  let h: number;
  if (max === rn) h = ((gn - bn) / delta) % 6;
  else if (max === gn) h = (bn - rn) / delta + 2;
  else h = (rn - gn) / delta + 4;

  return { h: (h * 60 + 360) % 360, s, l };
}

/** Shortest distance between two hues, 0–180 degrees. */
export function hueDistance(a: number, b: number): number {
  const diff = Math.abs(a - b) % 360;
  return diff > 180 ? 360 - diff : diff;
}

/** Relative luminance, 0–1. Used to decide overlay text colour. */
export function luminance({ r, g, b }: Rgb): number {
  const channel = (value: number) => {
    const v = value / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/**
 * How well a product colour sits against a room's palette, 0–1.
 *
 * Two ways to score well, which is how colour actually works in interiors:
 * a near-neutral goes with anything, and a saturated colour works when it
 * relates to something already in the room — either close in hue, or roughly
 * opposite it.
 */
export function paletteHarmony(productHex: string, paletteHexes: string[]): number {
  const product = hexToRgb(productHex);
  if (!product || paletteHexes.length === 0) return 0.5;

  const productHsl = rgbToHsl(product);

  // Near-neutrals are safe by construction.
  if (productHsl.s < 0.16) return 0.82;

  let best = 0;
  for (const hex of paletteHexes) {
    const other = hexToRgb(hex);
    if (!other) continue;
    const otherHsl = rgbToHsl(other);
    if (otherHsl.s < 0.1) continue; // A grey wall tells us nothing about hue.

    const distance = hueDistance(productHsl.h, otherHsl.h);
    // Analogous (within 40°) or complementary (150–180°) both read as deliberate.
    const analogous = 1 - Math.min(distance / 40, 1);
    const complementary = distance > 140 ? (distance - 140) / 40 : 0;
    best = Math.max(best, analogous * 0.95, complementary * 0.8);
  }

  // No hue in the room to relate to: neither a good nor a bad match.
  return best === 0 ? 0.55 : Math.min(1, 0.45 + best * 0.55);
}

/** A short, human colour name for a hex value. Used in recommendation copy. */
export function describeColor(hex: string): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return 'colour';
  const { h, s, l } = rgbToHsl(rgb);

  if (s < 0.12) {
    if (l > 0.82) return 'off-white';
    if (l > 0.55) return 'light grey';
    if (l > 0.28) return 'grey';
    return 'near-black';
  }

  if (h < 20 || h >= 345) return 'red';
  if (h < 45) return l > 0.5 ? 'warm sand' : 'terracotta';
  if (h < 68) return 'ochre';
  if (h < 160) return 'green';
  if (h < 200) return 'teal';
  if (h < 255) return 'blue';
  if (h < 300) return 'violet';
  return 'pink';
}

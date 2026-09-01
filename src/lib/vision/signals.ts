import type { BoundingBox, PaletteColor } from '@/types/domain';
import { clamp } from '@/lib/utils';

/**
 * Stage one of room understanding: cheap, local, deterministic image analysis.
 *
 * This runs in the browser on every scan, before any model is involved. It
 * produces the measurements that both providers depend on — palette, exposure,
 * sharpness, and an estimate of where the floor begins. Two reasons it lives
 * here rather than behind the API:
 *
 * - Photo-quality problems (too dark, out of focus) are caught before we spend
 *   a model call or the user's bandwidth on an unusable image.
 * - Without a vision key configured, these signals are enough to place real
 *   hotspots on real surfaces, so the product still works end to end.
 */

/** Working resolution for global statistics. Small enough to be instant. */
const GRID_WIDTH = 128;
/** Native-resolution crop used for focus measurement, which downsampling hides. */
const FOCUS_CROP = 384;

export interface ImageSignals {
  width: number;
  height: number;
  aspectRatio: number;
  grid: {
    width: number;
    height: number;
    /** Row-major luminance, 0-255. */
    luma: Float32Array;
    /** Row-major RGB triples, 0-255. */
    rgb: Uint8ClampedArray;
  };
  meanLuma: number;
  stdLuma: number;
  /** Normalised focus measure. Below ~0.12 the photo reads as soft. */
  sharpness: number;
  palette: PaletteColor[];
  /** Estimated normalised y where the floor meets the back wall. */
  horizon: number;
  /** Confidence in the horizon estimate, 0-1. */
  horizonConfidence: number;
  /** Bright, window-like regions, largest first. */
  brightRegions: BoundingBox[];
  /** Per-column visual busyness above the horizon, 0-1. Low means blank wall. */
  wallBusyness: number[];
}

function toLuma(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function drawTo(image: HTMLImageElement, width: number, height: number): ImageData | null {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(image, 0, 0, width, height);
  return ctx.getImageData(0, 0, width, height);
}

/** Laplacian variance on a native-resolution centre crop: the focus measure. */
function measureSharpness(image: HTMLImageElement): number {
  const size = Math.min(FOCUS_CROP, image.naturalWidth, image.naturalHeight);
  if (size < 32) return 1;

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return 1;

  const sx = (image.naturalWidth - size) / 2;
  const sy = (image.naturalHeight - size) / 2;
  ctx.drawImage(image, sx, sy, size, size, 0, 0, size, size);
  const { data } = ctx.getImageData(0, 0, size, size);

  const luma = new Float32Array(size * size);
  for (let i = 0; i < luma.length; i += 1) {
    luma[i] = toLuma(data[i * 4]!, data[i * 4 + 1]!, data[i * 4 + 2]!);
  }

  let sum = 0;
  let sumSq = 0;
  let count = 0;
  for (let y = 1; y < size - 1; y += 1) {
    for (let x = 1; x < size - 1; x += 1) {
      const i = y * size + x;
      const value =
        4 * luma[i]! - luma[i - 1]! - luma[i + 1]! - luma[i - size]! - luma[i + size]!;
      sum += value;
      sumSq += value * value;
      count += 1;
    }
  }
  if (count === 0) return 1;
  const mean = sum / count;
  const variance = sumSq / count - mean * mean;
  // ~600 is a comfortably sharp interior photo; map that to 1.
  return clamp(Math.sqrt(Math.max(variance, 0)) / 24, 0, 1);
}

/** Coarse 4x4x4 colour histogram, merged into three representative colours. */
function extractPalette(rgb: Uint8ClampedArray): PaletteColor[] {
  const bins = new Map<number, { count: number; r: number; g: number; b: number }>();
  const pixels = rgb.length / 3;

  for (let i = 0; i < pixels; i += 1) {
    const r = rgb[i * 3]!;
    const g = rgb[i * 3 + 1]!;
    const b = rgb[i * 3 + 2]!;
    const key = ((r >> 6) << 4) | ((g >> 6) << 2) | (b >> 6);
    const bin = bins.get(key);
    if (bin) {
      bin.count += 1;
      bin.r += r;
      bin.g += g;
      bin.b += b;
    } else {
      bins.set(key, { count: 1, r, g, b });
    }
  }

  const ranked = [...bins.values()]
    .map((bin) => ({
      count: bin.count,
      r: Math.round(bin.r / bin.count),
      g: Math.round(bin.g / bin.count),
      b: Math.round(bin.b / bin.count),
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 3);

  const roles: PaletteColor['role'][] = ['dominant', 'secondary', 'accent'];
  return ranked.map((bin, index) => ({
    hex: `#${[bin.r, bin.g, bin.b].map((c) => c.toString(16).padStart(2, '0')).join('')}`,
    weight: Number((bin.count / pixels).toFixed(3)),
    role: roles[index] ?? 'accent',
  }));
}

/**
 * Finds the strongest horizontal discontinuity in the lower half of the frame.
 *
 * In interior photography that edge is almost always the floor line, because
 * flooring and wall differ in both brightness and hue across a long straight
 * run. Rows are weighted towards the middle of the search band so a strong
 * skirting board doesn't lose to the very bottom edge of the frame.
 */
function estimateHorizon(
  luma: Float32Array,
  rgb: Uint8ClampedArray,
  width: number,
  height: number,
): { horizon: number; confidence: number } {
  const from = Math.floor(height * 0.35);
  const to = Math.floor(height * 0.92);
  if (to - from < 3) return { horizon: 0.62, confidence: 0 };

  const scores: number[] = [];
  for (let y = from; y < to; y += 1) {
    let energy = 0;
    for (let x = 0; x < width; x += 1) {
      const i = y * width + x;
      const j = (y - 1) * width + x;
      energy += Math.abs(luma[i]! - luma[j]!);
      // Hue shift matters as much as brightness: carpet against a pale wall.
      energy +=
        0.5 *
        (Math.abs(rgb[i * 3]! - rgb[j * 3]!) +
          Math.abs(rgb[i * 3 + 1]! - rgb[j * 3 + 1]!) +
          Math.abs(rgb[i * 3 + 2]! - rgb[j * 3 + 2]!)) /
        3;
    }
    scores.push(energy / width);
  }

  // Smooth to suppress single-row noise such as a skirting highlight.
  const smoothed = scores.map((_, i) => {
    const window = scores.slice(Math.max(0, i - 2), i + 3);
    return window.reduce((a, b) => a + b, 0) / window.length;
  });

  let bestIndex = 0;
  let best = -1;
  for (let i = 0; i < smoothed.length; i += 1) {
    // Prefer the middle of the band; the frame edges are rarely the floor line.
    const centreBias = 1 - Math.abs(i / smoothed.length - 0.45) * 0.5;
    const score = smoothed[i]! * centreBias;
    if (score > best) {
      best = score;
      bestIndex = i;
    }
  }

  const mean = smoothed.reduce((a, b) => a + b, 0) / smoothed.length;
  const peakRatio = mean > 0 ? best / mean : 0;
  return {
    horizon: (from + bestIndex) / height,
    // A clear floor line stands well above the average row energy.
    confidence: clamp((peakRatio - 1.15) / 1.2, 0, 1),
  };
}

/**
 * Connected bright regions in the upper frame — in an interior these are
 * windows, or occasionally a light fixture or a bright picture.
 */
function findBrightRegions(
  luma: Float32Array,
  width: number,
  height: number,
  mean: number,
  std: number,
): BoundingBox[] {
  const threshold = Math.min(mean + std * 1.15, 242);
  const searchBottom = Math.floor(height * 0.82);
  const visited = new Uint8Array(width * height);
  const regions: BoundingBox[] = [];
  const total = width * height;

  for (let y = 0; y < searchBottom; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const start = y * width + x;
      if (visited[start] || luma[start]! < threshold) continue;

      let minX = x;
      let maxX = x;
      let minY = y;
      let maxY = y;
      let area = 0;
      const stack = [start];
      visited[start] = 1;

      while (stack.length > 0) {
        const index = stack.pop()!;
        const cx = index % width;
        const cy = (index - cx) / width;
        area += 1;
        if (cx < minX) minX = cx;
        if (cx > maxX) maxX = cx;
        if (cy < minY) minY = cy;
        if (cy > maxY) maxY = cy;

        const neighbours = [
          cx > 0 ? index - 1 : -1,
          cx < width - 1 ? index + 1 : -1,
          cy > 0 ? index - width : -1,
          cy < searchBottom - 1 ? index + width : -1,
        ];
        for (const n of neighbours) {
          if (n >= 0 && !visited[n] && luma[n]! >= threshold) {
            visited[n] = 1;
            stack.push(n);
          }
        }
      }

      const boxWidth = maxX - minX + 1;
      const boxHeight = maxY - minY + 1;
      const fill = area / (boxWidth * boxHeight);
      const share = area / total;

      // Windows are sizeable, roughly rectangular, and solidly filled.
      if (share > 0.012 && share < 0.42 && fill > 0.55 && boxWidth > 3 && boxHeight > 3) {
        regions.push({
          x: minX / width,
          y: minY / height,
          width: boxWidth / width,
          height: boxHeight / height,
        });
      }
    }
  }

  return regions
    .sort((a, b) => b.width * b.height - a.width * a.height)
    .slice(0, 3);
}

/** Per-column edge density above the horizon. Blank wall scores near zero. */
function measureWallBusyness(
  luma: Float32Array,
  width: number,
  height: number,
  horizon: number,
): number[] {
  const bottom = Math.max(2, Math.floor(horizon * height));
  const columns: number[] = [];
  for (let x = 0; x < width; x += 1) {
    let energy = 0;
    for (let y = 1; y < bottom; y += 1) {
      const i = y * width + x;
      energy += Math.abs(luma[i]! - luma[i - width]!);
      if (x > 0) energy += Math.abs(luma[i]! - luma[i - 1]!);
    }
    columns.push(clamp(energy / (bottom * 26), 0, 1));
  }
  return columns;
}

/** Runs the full signal pass. Throws only if a 2D canvas context is refused. */
export function extractSignals(image: HTMLImageElement): ImageSignals {
  const aspectRatio = image.naturalWidth / image.naturalHeight;
  const gridWidth = GRID_WIDTH;
  const gridHeight = Math.max(8, Math.round(GRID_WIDTH / aspectRatio));

  const imageData = drawTo(image, gridWidth, gridHeight);
  if (!imageData) throw new Error('Canvas is unavailable in this browser.');

  const pixels = gridWidth * gridHeight;
  const luma = new Float32Array(pixels);
  const rgb = new Uint8ClampedArray(pixels * 3);

  for (let i = 0; i < pixels; i += 1) {
    const r = imageData.data[i * 4]!;
    const g = imageData.data[i * 4 + 1]!;
    const b = imageData.data[i * 4 + 2]!;
    rgb[i * 3] = r;
    rgb[i * 3 + 1] = g;
    rgb[i * 3 + 2] = b;
    luma[i] = toLuma(r, g, b);
  }

  let sum = 0;
  for (let i = 0; i < pixels; i += 1) sum += luma[i]!;
  const meanLuma = sum / pixels;

  let variance = 0;
  for (let i = 0; i < pixels; i += 1) variance += (luma[i]! - meanLuma) ** 2;
  const stdLuma = Math.sqrt(variance / pixels);

  const { horizon, confidence } = estimateHorizon(luma, rgb, gridWidth, gridHeight);

  return {
    width: image.naturalWidth,
    height: image.naturalHeight,
    aspectRatio,
    grid: { width: gridWidth, height: gridHeight, luma, rgb },
    meanLuma,
    stdLuma,
    sharpness: measureSharpness(image),
    palette: extractPalette(rgb),
    horizon,
    horizonConfidence: confidence,
    brightRegions: findBrightRegions(luma, gridWidth, gridHeight, meanLuma, stdLuma),
    wallBusyness: measureWallBusyness(luma, gridWidth, gridHeight, horizon),
  };
}

import type { Quad } from '@/types/domain';
import { sampleQuad } from '@/lib/geometry';

/**
 * Canvas drawing primitives for in-room placement.
 *
 * Canvas 2D has no perspective transform, so a quad is filled by slicing the
 * source image into vertical strips and drawing each one under its own affine
 * transform. With enough strips the piecewise approximation is
 * indistinguishable from a true projective map at display resolution, and it
 * costs nothing but a loop — no WebGL context, no shader pipeline, no second
 * rendering path to keep working.
 */

/** Strip count. 48 is past the point where more stops being visible. */
const DEFAULT_SLICES = 48;

/**
 * Draws `image` so that it exactly fills `quad`, whose points are in pixels.
 *
 * Strips are drawn fractionally wider than their slot so neighbouring edges
 * overlap; without that, antialiasing leaves hairline seams between them.
 */
export function drawImageInQuad(
  ctx: CanvasRenderingContext2D,
  image: CanvasImageSource,
  quad: Quad,
  sourceWidth: number,
  sourceHeight: number,
  slices = DEFAULT_SLICES,
): void {
  const overlap = 1.02;

  for (let i = 0; i < slices; i += 1) {
    const u0 = i / slices;
    const u1 = (i + 1) / slices;

    const topLeft = sampleQuad(quad, u0, 0);
    const topRight = sampleQuad(quad, u1, 0);
    const bottomLeft = sampleQuad(quad, u0, 1);

    const sx = u0 * sourceWidth;
    const sw = (u1 - u0) * sourceWidth;
    if (sw <= 0) continue;

    // Basis vectors mapping the strip's source rect onto its destination
    // parallelogram: (0,0)→topLeft, (sw,0)→topRight, (0,sh)→bottomLeft.
    const ax = (topRight.x - topLeft.x) / sw;
    const ay = (topRight.y - topLeft.y) / sw;
    const bx = (bottomLeft.x - topLeft.x) / sourceHeight;
    const by = (bottomLeft.y - topLeft.y) / sourceHeight;

    ctx.save();
    ctx.setTransform(ax, ay, bx, by, topLeft.x, topLeft.y);
    ctx.drawImage(image, sx, 0, sw, sourceHeight, 0, 0, sw * overlap, sourceHeight);
    ctx.restore();
  }

  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

/**
 * A soft contact shadow beneath a placed object.
 *
 * This is what stops a lamp looking like a sticker. The ellipse sits on the
 * quad's bottom edge and follows its width, so an object placed further into
 * the room casts a correspondingly smaller shadow.
 */
export function drawContactShadow(
  ctx: CanvasRenderingContext2D,
  quad: Quad,
  /** 0–1 room brightness. Dim rooms get softer, weaker shadows. */
  brightness: number,
): void {
  const left = sampleQuad(quad, 0, 1);
  const right = sampleQuad(quad, 1, 1);
  const centreX = (left.x + right.x) / 2;
  const centreY = (left.y + right.y) / 2;
  const width = Math.hypot(right.x - left.x, right.y - left.y);
  if (width < 4) return;

  const radiusX = width * 0.62;
  const radiusY = Math.max(width * 0.1, 3);
  const alpha = 0.14 + brightness * 0.22;

  const gradient = ctx.createRadialGradient(centreX, centreY, 0, centreX, centreY, radiusX);
  gradient.addColorStop(0, `rgba(0,0,0,${alpha.toFixed(3)})`);
  gradient.addColorStop(0.55, `rgba(0,0,0,${(alpha * 0.45).toFixed(3)})`);
  gradient.addColorStop(1, 'rgba(0,0,0,0)');

  ctx.save();
  ctx.translate(centreX, centreY);
  ctx.scale(1, radiusY / radiusX);
  ctx.translate(-centreX, -centreY);
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(centreX, centreY, radiusX, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export interface RegionLight {
  /** Mean colour of the room beneath the placement, 0–255 per channel. */
  r: number;
  g: number;
  b: number;
  /** Mean luminance of that region, 0–1. */
  brightness: number;
}

/** Samples the room's own colour and brightness where the product will sit. */
export function sampleRegionLight(
  ctx: CanvasRenderingContext2D,
  quad: Quad,
  canvasWidth: number,
  canvasHeight: number,
): RegionLight {
  const xs = [quad.topLeft.x, quad.topRight.x, quad.bottomRight.x, quad.bottomLeft.x];
  const ys = [quad.topLeft.y, quad.topRight.y, quad.bottomRight.y, quad.bottomLeft.y];

  const x = Math.max(0, Math.floor(Math.min(...xs)));
  const y = Math.max(0, Math.floor(Math.min(...ys)));
  const width = Math.min(canvasWidth - x, Math.ceil(Math.max(...xs) - x));
  const height = Math.min(canvasHeight - y, Math.ceil(Math.max(...ys) - y));

  if (width < 2 || height < 2) return { r: 128, g: 128, b: 128, brightness: 0.5 };

  const { data } = ctx.getImageData(x, y, width, height);
  let r = 0;
  let g = 0;
  let b = 0;
  // Sampling every 16th pixel is ample for a mean and keeps this off the
  // critical path on a large photograph.
  const stride = 16 * 4;
  let count = 0;
  for (let i = 0; i < data.length; i += stride) {
    r += data[i]!;
    g += data[i + 1]!;
    b += data[i + 2]!;
    count += 1;
  }
  if (count === 0) return { r: 128, g: 128, b: 128, brightness: 0.5 };

  r /= count;
  g /= count;
  b /= count;
  return { r, g, b, brightness: (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 };
}

/**
 * Grades a product's artwork to the light it is being placed into.
 *
 * Two passes, both clipped to the artwork's own alpha: a colour cast pulling it
 * towards the room's ambient hue, and an exposure adjustment. Untreated
 * artwork keeps its studio lighting and reads as a cut-out, however well it is
 * positioned.
 */
export function gradeToRoom(
  source: HTMLImageElement,
  light: RegionLight,
): HTMLCanvasElement | HTMLImageElement {
  const width = source.naturalWidth || source.width;
  const height = source.naturalHeight || source.height;
  if (width === 0 || height === 0) return source;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return source;

  ctx.drawImage(source, 0, 0, width, height);

  // Everything below paints only where the artwork already has pixels.
  ctx.globalCompositeOperation = 'source-atop';

  ctx.fillStyle = `rgba(${Math.round(light.r)},${Math.round(light.g)},${Math.round(light.b)},0.17)`;
  ctx.fillRect(0, 0, width, height);

  const exposure = light.brightness - 0.5;
  if (exposure < -0.06) {
    ctx.fillStyle = `rgba(0,0,0,${Math.min(0.32, -exposure * 0.55).toFixed(3)})`;
    ctx.fillRect(0, 0, width, height);
  } else if (exposure > 0.1) {
    ctx.fillStyle = `rgba(255,255,255,${Math.min(0.16, exposure * 0.3).toFixed(3)})`;
    ctx.fillRect(0, 0, width, height);
  }

  ctx.globalCompositeOperation = 'source-over';
  return canvas;
}

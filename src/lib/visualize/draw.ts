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
 * Each strip draws the *whole* image under its own transform and clips to its
 * slot, rather than drawing a source sub-rectangle. That distinction matters:
 * drawing a sub-rectangle antialiases the strip's own edges against nothing,
 * and 48 of those semi-transparent edges read as regular vertical banding
 * across the placed product. Clipping has no such edge — the image is
 * continuous across the cut, and adjacent clip regions overlap by just under a
 * pixel so no hairline shows between them either.
 */
export function drawImageInQuad(
  ctx: CanvasRenderingContext2D,
  image: CanvasImageSource,
  quad: Quad,
  sourceWidth: number,
  sourceHeight: number,
  slices = DEFAULT_SLICES,
): void {
  /** Clip overlap, in pixels. Just over half a pixel on each side. */
  const pad = 0.75;

  for (let i = 0; i < slices; i += 1) {
    const u0 = i / slices;
    const u1 = (i + 1) / slices;

    const topLeft = sampleQuad(quad, u0, 0);
    const topRight = sampleQuad(quad, u1, 0);
    const bottomRight = sampleQuad(quad, u1, 1);
    const bottomLeft = sampleQuad(quad, u0, 1);

    const sx = u0 * sourceWidth;
    const sw = (u1 - u0) * sourceWidth;
    if (sw <= 0) continue;

    // Basis vectors mapping source space onto this strip's destination
    // parallelogram, and an origin placed so that source x = sx lands on
    // topLeft. Extrapolating the origin is what lets the full image be drawn.
    const ax = (topRight.x - topLeft.x) / sw;
    const ay = (topRight.y - topLeft.y) / sw;
    const bx = (bottomLeft.x - topLeft.x) / sourceHeight;
    const by = (bottomLeft.y - topLeft.y) / sourceHeight;
    const ox = topLeft.x - ax * sx;
    const oy = topLeft.y - ay * sx;

    const top = unit(topLeft, topRight);
    const bottom = unit(bottomLeft, bottomRight);

    ctx.save();
    // The path is built while the transform is still the identity, so the clip
    // is in canvas pixels; setTransform afterwards moves the drawing, not it.
    ctx.beginPath();
    ctx.moveTo(topLeft.x - top.x * pad, topLeft.y - top.y * pad);
    ctx.lineTo(topRight.x + top.x * pad, topRight.y + top.y * pad);
    ctx.lineTo(bottomRight.x + bottom.x * pad, bottomRight.y + bottom.y * pad);
    ctx.lineTo(bottomLeft.x - bottom.x * pad, bottomLeft.y - bottom.y * pad);
    ctx.closePath();
    ctx.clip();

    ctx.setTransform(ax, ay, bx, by, ox, oy);
    ctx.drawImage(image, 0, 0, sourceWidth, sourceHeight);
    ctx.restore();
  }

  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

/** Unit vector from `from` to `to`, or zero when they coincide. */
function unit(from: { x: number; y: number }, to: { x: number; y: number }) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  return length < 1e-6 ? { x: 0, y: 0 } : { x: dx / length, y: dy / length };
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

/**
 * Removes a product photograph's backdrop, returning artwork with alpha.
 *
 * Generated artwork already has transparency; retailer photography does not —
 * it arrives on a white or near-white sweep. Compositing that straight into a
 * room pastes a visible rectangle.
 *
 * The fill is flood-filled inward from the frame edges rather than keyed by
 * colour across the whole image. Colour keying would also erase every white
 * part of the product itself, which for interiors — a white lampshade, a chalk
 * vase, pale linen — is most of the catalogue. Only background connected to an
 * edge is removed.
 */
export function keyOutBackground(source: CanvasImageSource, width: number, height: number) {
  if (width < 4 || height < 4) return source;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return source;

  ctx.drawImage(source, 0, 0, width, height);
  const image = ctx.getImageData(0, 0, width, height);
  const { data } = image;

  /** Channel distance within which a pixel counts as the same backdrop. */
  const tolerance = 34;

  const sample = (index: number) => [data[index]!, data[index + 1]!, data[index + 2]!] as const;
  // The backdrop is whatever the corners agree on.
  const corners = [0, (width - 1) * 4, (height - 1) * width * 4, (height * width - 1) * 4];
  const base = corners.map(sample);
  const backdrop = [0, 1, 2].map(
    (channel) => base.reduce((total, rgb) => total + rgb[channel]!, 0) / base.length,
  );

  // A dark or busy corner means this is a lifestyle shot, not a cut-out; taking
  // a bite out of it would look far worse than leaving it alone.
  const brightEnough = backdrop.every((channel) => channel > 180);
  const consistent = base.every((rgb) =>
    rgb.every((channel, i) => Math.abs(channel - backdrop[i]!) < tolerance),
  );
  if (!brightEnough || !consistent) return source;

  const matches = (index: number) => {
    const rgb = sample(index);
    return rgb.every((channel, i) => Math.abs(channel - backdrop[i]!) <= tolerance);
  };

  const visited = new Uint8Array(width * height);
  const stack: number[] = [];
  for (let x = 0; x < width; x += 1) {
    stack.push(x, (height - 1) * width + x);
  }
  for (let y = 0; y < height; y += 1) {
    stack.push(y * width, y * width + width - 1);
  }

  while (stack.length > 0) {
    const pixel = stack.pop()!;
    if (visited[pixel]) continue;
    if (!matches(pixel * 4)) continue;
    visited[pixel] = 1;
    data[pixel * 4 + 3] = 0;

    const x = pixel % width;
    const y = (pixel - x) / width;
    if (x > 0) stack.push(pixel - 1);
    if (x < width - 1) stack.push(pixel + 1);
    if (y > 0) stack.push(pixel - width);
    if (y < height - 1) stack.push(pixel + width);
  }

  // Feather the cut so the product does not have a hard, aliased outline.
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const pixel = y * width + x;
      if (visited[pixel]) continue;
      const exposed =
        visited[pixel - 1]! + visited[pixel + 1]! + visited[pixel - width]! + visited[pixel + width]!;
      if (exposed > 0) data[pixel * 4 + 3] = Math.round(255 * (1 - exposed / 6));
    }
  }

  ctx.putImageData(image, 0, 0);
  return canvas;
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
  source: CanvasImageSource,
  light: RegionLight,
  size: { width: number; height: number },
): CanvasImageSource {
  const { width, height } = size;
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

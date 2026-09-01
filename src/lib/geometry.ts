import type { BoundingBox, Point, Quad } from '@/types/domain';
import { clamp } from '@/lib/utils';

/**
 * Quad maths for perspective-aware placement.
 *
 * A quad is treated as a unit surface parameterised by (u, v), where u runs
 * left-to-right along the top and bottom edges and v runs top-to-bottom. That
 * lets the rest of the app talk about placement in surface terms — "centre a
 * mirror across the middle 40% of this wall" — without touching pixels.
 */

export function point(x: number, y: number): Point {
  return { x, y };
}

function mix(a: Point, b: Point, t: number): Point {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

/** Bilinear sample of the quad's surface at (u, v), each in 0-1. */
export function sampleQuad(quad: Quad, u: number, v: number): Point {
  const top = mix(quad.topLeft, quad.topRight, u);
  const bottom = mix(quad.bottomLeft, quad.bottomRight, u);
  return mix(top, bottom, v);
}

/** The sub-surface spanning (u0, v0) to (u1, v1) of a parent quad. */
export function subQuad(quad: Quad, u0: number, v0: number, u1: number, v1: number): Quad {
  return {
    topLeft: sampleQuad(quad, u0, v0),
    topRight: sampleQuad(quad, u1, v0),
    bottomRight: sampleQuad(quad, u1, v1),
    bottomLeft: sampleQuad(quad, u0, v1),
  };
}

export function quadFromBox(box: BoundingBox): Quad {
  const { x, y, width, height } = box;
  return {
    topLeft: point(x, y),
    topRight: point(x + width, y),
    bottomRight: point(x + width, y + height),
    bottomLeft: point(x, y + height),
  };
}

export function boxFromQuad(quad: Quad): BoundingBox {
  const xs = [quad.topLeft.x, quad.topRight.x, quad.bottomRight.x, quad.bottomLeft.x];
  const ys = [quad.topLeft.y, quad.topRight.y, quad.bottomRight.y, quad.bottomLeft.y];
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  return { x: minX, y: minY, width: Math.max(...xs) - minX, height: Math.max(...ys) - minY };
}

export function quadCentre(quad: Quad): Point {
  return sampleQuad(quad, 0.5, 0.5);
}

function distance(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/** Mean width of the quad's top and bottom edges, in normalised units. */
export function quadWidth(quad: Quad): number {
  return (distance(quad.topLeft, quad.topRight) + distance(quad.bottomLeft, quad.bottomRight)) / 2;
}

/** Mean height of the quad's left and right edges, in normalised units. */
export function quadHeight(quad: Quad): number {
  return (distance(quad.topLeft, quad.bottomLeft) + distance(quad.topRight, quad.bottomRight)) / 2;
}

/** Shoelace area, in normalised square units. */
export function quadArea(quad: Quad): number {
  const p = [quad.topLeft, quad.topRight, quad.bottomRight, quad.bottomLeft];
  let sum = 0;
  for (let i = 0; i < 4; i += 1) {
    const a = p[i]!;
    const b = p[(i + 1) % 4]!;
    sum += a.x * b.y - b.x * a.y;
  }
  return Math.abs(sum) / 2;
}

/**
 * How strongly the surface recedes: 0 is flat-on to the camera, higher values
 * mean one edge is much shorter than the other. Used to decide whether a
 * placement is convincing enough to attempt.
 */
export function perspectiveSkew(quad: Quad): number {
  const left = distance(quad.topLeft, quad.bottomLeft);
  const right = distance(quad.topRight, quad.bottomRight);
  const longest = Math.max(left, right);
  if (longest === 0) return 0;
  return Math.abs(left - right) / longest;
}

/** Shrinks a quad towards its centre by `amount` of its size on each axis. */
export function insetQuad(quad: Quad, amount: number): Quad {
  const a = clamp(amount, 0, 0.49);
  return subQuad(quad, a, a, 1 - a, 1 - a);
}

export function boxContains(box: BoundingBox, p: Point): boolean {
  return p.x >= box.x && p.x <= box.x + box.width && p.y >= box.y && p.y <= box.y + box.height;
}

/** Fractional overlap of `a` that is covered by `b`, 0-1. */
export function boxOverlap(a: BoundingBox, b: BoundingBox): number {
  const w = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
  const h = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  const areaA = a.width * a.height;
  return areaA === 0 ? 0 : (w * h) / areaA;
}

/** Scales a normalised quad into pixel space. */
export function quadToPixels(quad: Quad, width: number, height: number): Quad {
  const scale = (p: Point): Point => ({ x: p.x * width, y: p.y * height });
  return {
    topLeft: scale(quad.topLeft),
    topRight: scale(quad.topRight),
    bottomRight: scale(quad.bottomRight),
    bottomLeft: scale(quad.bottomLeft),
  };
}

/**
 * Places a rectangle of the given aspect ratio inside a quad, sized to
 * `coverage` of the quad's width and anchored by (`anchorU`, `anchorV`).
 *
 * `anchorV` of 1 rests the object's base on the quad's bottom edge — which is
 * what makes standing objects like lamps meet the floor rather than hover.
 */
export function fitInQuad(
  quad: Quad,
  aspectRatio: number,
  coverage: number,
  anchorU = 0.5,
  anchorV = 0.5,
): Quad {
  const surfaceAspect = quadWidth(quad) / Math.max(quadHeight(quad), 1e-6);
  const u = clamp(coverage, 0.02, 1);
  // Convert the object's own aspect ratio into the quad's (u, v) space.
  const v = clamp((u / aspectRatio) * surfaceAspect, 0.02, 1);
  return positionInQuad(quad, u, v, anchorU, anchorV);
}

/**
 * As `fitInQuad`, but `coverage` is the fraction of the quad's **height** the
 * object should occupy.
 *
 * This is the right axis for anything that stands on a floor or rests on a
 * surface. What makes a floor lamp read as a floor lamp is its height against
 * the wall behind it; sizing it by a fraction of the region's width produces a
 * correctly-proportioned object at entirely the wrong scale.
 */
export function fitInQuadByHeight(
  quad: Quad,
  aspectRatio: number,
  coverage: number,
  anchorU = 0.5,
  anchorV = 1,
): Quad {
  const surfaceAspect = quadWidth(quad) / Math.max(quadHeight(quad), 1e-6);
  const v = clamp(coverage, 0.02, 1);
  const u = clamp((v * aspectRatio) / surfaceAspect, 0.02, 1);
  return positionInQuad(quad, u, v, anchorU, anchorV);
}

/**
 * Places a (u, v)-sized box within a quad.
 *
 * `anchorV` names the point on the object that lands on `anchorV` of the quad:
 * 1 seats its base on the quad's bottom edge, 0.5 centres it.
 */
function positionInQuad(quad: Quad, u: number, v: number, anchorU: number, anchorV: number): Quad {
  const u0 = clamp(anchorU - u / 2, 0, 1 - u);
  const v0 = clamp(anchorV - v * anchorV, 0, 1 - v);
  return subQuad(quad, u0, v0, u0 + u, v0 + v);
}

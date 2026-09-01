import type { BoundingBox, DetectedObject } from '@/types/domain';
import { createId, clamp } from '@/lib/utils';
import { quadFromBox } from '@/lib/geometry';
import type { ImageSignals } from '../signals';
import {
  classifyLighting,
  type VisionProvider,
  type VisionRequest,
  type VisionResult,
} from '../provider';

/**
 * Geometry-only room understanding, computed on device.
 *
 * This is what the product does when no vision model is configured, and it is
 * not a stub: walls, windows, floors and corners are genuinely inferred from
 * the photograph's own pixels — the floor line from the strongest horizontal
 * discontinuity, windows from connected bright regions, blank wall from columns
 * with no edge energy.
 *
 * What it deliberately does not do is guess at furniture. A sofa is not
 * geometrically inferable, and inventing one would put a hotspot on empty
 * carpet. So it reports what it can measure, marks itself heuristic, and the UI
 * says "surfaces only" rather than implying the room was recognised.
 */

/** Column edge-energy below which a stretch of wall reads as blank. */
const BLANK_WALL_THRESHOLD = 0.19;
/** A wall must span at least this fraction of the frame to hang anything on. */
const MIN_WALL_SPAN = 0.17;
/** Mean busyness below which an edge strip reads as an empty corner. */
const EMPTY_CORNER_THRESHOLD = 0.16;
/** Width of the strip at each frame edge examined for a corner. */
const CORNER_STRIP = 0.2;

export class HeuristicVisionProvider implements VisionProvider {
  readonly name = 'heuristic-geometry';
  readonly isHeuristic = true;

  async detect({ signals }: VisionRequest): Promise<VisionResult> {
    const objects: DetectedObject[] = [];

    const windows = detectWindows(signals);
    objects.push(...windows);

    const floor = detectFloor(signals);
    if (floor) objects.push(floor);

    const wall = detectWall(signals, windows);
    if (wall) objects.push(wall);

    const corner = detectCorner(signals);
    if (corner) objects.push(corner);

    return {
      // Room type is not inferable from geometry. Saying 'other' with low
      // confidence lets the UI ask the user, which is both honest and better
      // input than a guess would have been.
      roomType: 'other',
      roomTypeConfidence: 0,
      styles: [],
      lighting: classifyLighting(signals.meanLuma),
      objects,
    };
  }
}

function detectWindows(signals: ImageSignals): DetectedObject[] {
  return signals.brightRegions
    .filter((region) => {
      const aspect = region.width / region.height;
      const area = region.width * region.height;
      // Windows sit above the floor line, are not slivers, and are not the
      // whole frame (which would be an overexposed photo, not a window).
      return (
        region.y + region.height < signals.horizon + 0.08 &&
        aspect > 0.22 &&
        aspect < 4.5 &&
        area > 0.014 &&
        area < 0.36
      );
    })
    .slice(0, 2)
    .map((region) => ({
      id: createId('obj'),
      type: 'window' as const,
      boundingBox: region,
      surface: quadFromBox(region),
      // Brightness is strong evidence of an opening but not proof of a window.
      confidence: clamp(0.5 + region.width * region.height * 0.9, 0.5, 0.72),
      attributes: {
        coverage: Number((region.width * region.height).toFixed(3)),
        orientation: 'frontal' as const,
        notes: 'Inferred from a bright, solidly filled region above the floor line.',
      },
    }));
}

function detectFloor(signals: ImageSignals): DetectedObject | null {
  // A floor line found right at the frame edge is almost certainly a shadow or
  // the bottom of the photo, not the room.
  if (signals.horizon > 0.9 || signals.horizonConfidence < 0.12) return null;

  const top = signals.horizon;
  const box: BoundingBox = { x: 0, y: top, width: 1, height: 1 - top };

  return {
    id: createId('obj'),
    type: 'floor',
    boundingBox: box,
    // A receding plane, not a rectangle: the far edge is narrower than the near
    // edge, which is what lets a rug sit in the room rather than on the lens.
    surface: {
      topLeft: { x: 0.2, y: top },
      topRight: { x: 0.8, y: top },
      bottomRight: { x: 1.04, y: 1 },
      bottomLeft: { x: -0.04, y: 1 },
    },
    confidence: clamp(0.42 + signals.horizonConfidence * 0.45, 0.42, 0.85),
    attributes: {
      coverage: Number((1 - top).toFixed(3)),
      orientation: 'oblique',
      notes: 'Floor plane estimated from the strongest horizontal edge in the lower frame.',
    },
  };
}

/** The widest run of columns above the floor line with no edge energy in it. */
function detectWall(signals: ImageSignals, windows: DetectedObject[]): DetectedObject | null {
  const columns = signals.wallBusyness;
  if (columns.length === 0) return null;

  const blocked = (index: number) => {
    const u = index / columns.length;
    return windows.some(
      ({ boundingBox: b }) => u >= b.x - 0.02 && u <= b.x + b.width + 0.02,
    );
  };

  let bestStart = 0;
  let bestLength = 0;
  let start = -1;

  for (let i = 0; i <= columns.length; i += 1) {
    const blank = i < columns.length && columns[i]! < BLANK_WALL_THRESHOLD && !blocked(i);
    if (blank) {
      if (start === -1) start = i;
    } else if (start !== -1) {
      if (i - start > bestLength) {
        bestLength = i - start;
        bestStart = start;
      }
      start = -1;
    }
  }

  const span = bestLength / columns.length;
  if (span < MIN_WALL_SPAN) return null;

  const x = bestStart / columns.length;
  // Leave the very top of the frame out: that band is usually ceiling.
  const top = signals.horizon * 0.12;
  const bottom = signals.horizon * 0.94;
  const box: BoundingBox = { x, y: top, width: span, height: bottom - top };

  return {
    id: createId('obj'),
    type: 'wall',
    boundingBox: box,
    surface: quadFromBox(box),
    confidence: clamp(0.45 + span * 0.5, 0.45, 0.8),
    attributes: {
      coverage: Number((span * (bottom - top)).toFixed(3)),
      dominantColor: signals.palette[0]?.hex,
      occupied: false,
      orientation: 'frontal',
      notes: 'A stretch of wall with no detected edges — nothing appears to be hanging here.',
    },
  };
}

/** The quieter of the two frame edges, if either is quiet enough to be empty. */
function detectCorner(signals: ImageSignals): DetectedObject | null {
  const columns = signals.wallBusyness;
  if (columns.length === 0 || signals.horizon > 0.9) return null;

  const stripWidth = Math.max(1, Math.round(columns.length * CORNER_STRIP));
  const mean = (values: number[]) => values.reduce((a, b) => a + b, 0) / Math.max(values.length, 1);

  const left = mean(columns.slice(0, stripWidth));
  const right = mean(columns.slice(-stripWidth));
  const quietest = left <= right ? 'left' : 'right';
  const busyness = Math.min(left, right);

  if (busyness > EMPTY_CORNER_THRESHOLD) return null;

  // A corner is a standing space: from mid-wall down to just past the floor line.
  const box: BoundingBox = {
    x: quietest === 'left' ? 0.02 : 1 - CORNER_STRIP - 0.02,
    y: signals.horizon * 0.42,
    width: CORNER_STRIP,
    height: Math.min(1, signals.horizon * 1.12) - signals.horizon * 0.42,
  };

  return {
    id: createId('obj'),
    type: 'corner',
    boundingBox: box,
    surface: quadFromBox(box),
    confidence: clamp(0.4 + (EMPTY_CORNER_THRESHOLD - busyness) * 1.6, 0.4, 0.7),
    attributes: {
      coverage: Number((box.width * box.height).toFixed(3)),
      occupied: false,
      orientation: 'angled',
      notes: `The ${quietest} edge of the frame has no detected content.`,
    },
  };
}

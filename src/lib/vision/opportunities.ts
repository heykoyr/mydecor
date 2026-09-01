import {
  MAX_VISIBLE_HOTSPOTS,
  MIN_RENDER_CONFIDENCE,
  type DetectedObject,
  type ObjectType,
  type Opportunity,
  type OpportunityType,
  type PlacementMode,
  type Point,
  type ProductCategory,
  type Quad,
  type RoomAnalysis,
  type RoomType,
} from '@/types/domain';
import { boxOverlap, quadFromBox, sampleQuad, subQuad } from '@/lib/geometry';
import { clamp, createId } from '@/lib/utils';

/**
 * The opportunity engine.
 *
 * This is where perception becomes product reasoning, and it is deliberately
 * ordinary code rather than a model call. Three reasons:
 *
 * - It is testable. "An empty wall over 17% of the frame yields one wall-art
 *   opportunity" is an assertion; "the model usually suggests art" is not.
 * - It is stable. Swapping the vision provider changes what is *seen*, never
 *   what is *recommended*, so a model upgrade cannot silently change the
 *   product's taste.
 * - It can say no. The rules below suppress opportunities for surfaces that are
 *   already decorated, which is the difference between a product that
 *   understands a room and a catalogue that lists everything it sells.
 */

/** Anchors closer together than this collapse into one hotspot. */
const MIN_ANCHOR_SEPARATION = 0.13;

interface Rule {
  type: OpportunityType;
  placement: PlacementMode;
  categories: ProductCategory[];
  title: string;
  rationale: string;
  /** Impact per pound spent, roughly. Tuned by hand, then by engagement data. */
  basePriority: number;
  /** Object types that already satisfy this opportunity. */
  satisfiedBy: ObjectType[];
  /** Fraction of the target a satisfying object must cover to suppress the rule. */
  satisfiedAt: number;
  region: (object: DetectedObject) => Quad;
  anchor: (region: Quad) => Point;
  /** Optional extra gate beyond object presence. */
  applies?: (object: DetectedObject, context: Context) => boolean;
  /** Situational boost, e.g. lighting opportunities in a dim room. */
  adjust?: (context: Context) => number;
}

interface Context {
  roomType: RoomType;
  lighting: RoomAnalysis['lighting'];
  objects: DetectedObject[];
}

function surfaceOf(object: DetectedObject): Quad {
  return object.surface ?? quadFromBox(object.boundingBox);
}

/**
 * Grows a quad outwards in surface space. Curtains hang wider and lower than
 * the window they dress, so the placement region is not the window itself.
 */
function expand(quad: Quad, sides: number, top: number, bottom: number): Quad {
  return subQuad(quad, -sides, -top, 1 + sides, 1 + bottom);
}

const RULES: Partial<Record<ObjectType, Rule[]>> = {
  window: [
    {
      type: 'soften_window',
      placement: 'overlay_surface',
      categories: ['curtains', 'blinds', 'curtain_rods'],
      title: 'Soften this window',
      rationale:
        'Bare glass reflects both light and sound. Fabric is the fastest way to make a room feel settled.',
      basePriority: 0.9,
      satisfiedBy: ['curtains'],
      satisfiedAt: 0.35,
      region: (object) => expand(surfaceOf(object), 0.18, 0.12, 0.55),
      // The region extends well below the sill to allow for a full drop, so the
      // mark is placed towards its top — over the glass, which is what the user
      // is being asked about.
      anchor: (region) => sampleQuad(region, 0.5, 0.32),
    },
  ],

  wall: [
    {
      type: 'dress_empty_wall',
      placement: 'mounted',
      categories: ['wall_art', 'mirrors', 'shelving'],
      title: 'Fill this wall',
      rationale:
        'A blank wall this size is the single biggest change available in this room.',
      basePriority: 0.82,
      satisfiedBy: ['artwork', 'mirror', 'shelving', 'tv'],
      satisfiedAt: 0.22,
      region: (object) => surfaceOf(object),
      anchor: (region) => sampleQuad(region, 0.5, 0.42),
      // A sliver of wall between two windows is not somewhere to hang anything.
      applies: (object) => object.boundingBox.width > 0.16,
    },
  ],

  floor: [
    {
      type: 'ground_the_floor',
      placement: 'overlay_surface',
      categories: ['rugs'],
      title: 'Ground the room',
      rationale: 'A rug pulls loose furniture into one group and quiets a hard floor.',
      basePriority: 0.85,
      satisfiedBy: ['rug'],
      satisfiedAt: 0.25,
      // The near half of the floor plane, inset from the frame edges.
      region: (object) => subQuad(surfaceOf(object), 0.12, 0.22, 0.88, 0.94),
      anchor: (region) => sampleQuad(region, 0.5, 0.5),
    },
  ],

  corner: [
    {
      type: 'fill_empty_corner',
      placement: 'standing',
      categories: ['floor_lamps', 'plants', 'planters'],
      title: 'Use this corner',
      rationale: 'Empty corners read as unfinished. One tall object is usually enough.',
      basePriority: 0.7,
      satisfiedBy: ['plant', 'lighting', 'chair', 'storage'],
      satisfiedAt: 0.28,
      region: (object) => surfaceOf(object),
      anchor: (region) => sampleQuad(region, 0.5, 0.72),
    },
  ],

  sofa: [
    {
      type: 'layer_the_sofa',
      placement: 'resting',
      categories: ['cushions', 'throws', 'side_tables'],
      title: 'Layer the sofa',
      rationale: 'Texture here changes how the whole room feels, for very little money.',
      basePriority: 0.66,
      satisfiedBy: [],
      satisfiedAt: 1,
      region: (object) => subQuad(surfaceOf(object), 0.1, 0.05, 0.9, 0.55),
      anchor: (region) => sampleQuad(region, 0.5, 0.45),
    },
  ],

  bed: [
    {
      type: 'dress_the_bed',
      placement: 'resting',
      categories: ['bedding', 'cushions', 'throws'],
      title: 'Dress the bed',
      rationale: 'The bed is the largest surface in the room, so it sets the tone.',
      basePriority: 0.78,
      satisfiedBy: [],
      satisfiedAt: 1,
      region: (object) => subQuad(surfaceOf(object), 0.05, 0.05, 0.95, 0.7),
      anchor: (region) => sampleQuad(region, 0.5, 0.4),
    },
  ],

  tv: [
    {
      type: 'anchor_the_tv_wall',
      placement: 'standing',
      categories: ['media_console', 'wall_art', 'floor_lamps'],
      title: 'Anchor the screen',
      rationale: 'A screen on a bare wall looks temporary. Give it something to sit against.',
      basePriority: 0.62,
      satisfiedBy: ['storage'],
      satisfiedAt: 0.3,
      region: (object) => expand(surfaceOf(object), 0.25, -0.9, 1.4),
      anchor: (region) => sampleQuad(region, 0.5, 0.7),
    },
  ],

  table: [
    {
      type: 'style_the_surface',
      placement: 'resting',
      categories: ['vases', 'table_lamps', 'baskets'],
      title: 'Style this surface',
      rationale: 'An empty surface is a missed chance at height and colour.',
      basePriority: 0.48,
      satisfiedBy: ['decor', 'plant'],
      satisfiedAt: 0.2,
      // Objects on a table stand *on* its top edge and rise above it, so the
      // region runs upward from just inside the surface.
      region: (object) => subQuad(surfaceOf(object), 0.15, -0.5, 0.85, 0.08),
      anchor: (region) => sampleQuad(region, 0.5, 0.55),
    },
  ],

  desk: [
    {
      type: 'style_the_surface',
      placement: 'resting',
      categories: ['table_lamps', 'vases', 'baskets'],
      title: 'Light this desk',
      rationale: 'A desk lamp at eye level is the difference between working here and not.',
      basePriority: 0.55,
      satisfiedBy: ['lighting', 'decor'],
      satisfiedAt: 0.2,
      // A lamp belongs at one end of the desk, standing on it.
      region: (object) => subQuad(surfaceOf(object), 0.58, -0.55, 0.96, 0.06),
      anchor: (region) => sampleQuad(region, 0.5, 0.55),
    },
  ],

  ceiling: [
    {
      type: 'light_the_room',
      placement: 'mounted',
      categories: ['pendant_lights'],
      title: 'Light the room',
      rationale:
        'One warm light source above eye level makes an evening room feel warm rather than merely lit.',
      basePriority: 0.5,
      satisfiedBy: ['lighting'],
      satisfiedAt: 0.15,
      region: (object) => subQuad(surfaceOf(object), 0.3, 0, 0.7, 0.8),
      anchor: (region) => sampleQuad(region, 0.5, 0.5),
      // Only worth suggesting where the room is visibly under-lit.
      adjust: (context) => (context.lighting === 'dim' ? 0.22 : -0.1),
    },
  ],
};

/** Room types where a given opportunity makes no sense. */
const EXCLUSIONS: Partial<Record<OpportunityType, RoomType[]>> = {
  ground_the_floor: ['bathroom', 'kitchen', 'outdoor'],
  dress_the_bed: ['living_room', 'kitchen', 'dining_room', 'bathroom', 'hallway', 'outdoor'],
  layer_the_sofa: ['bathroom', 'kitchen'],
};

/** True when something already present covers enough of the target. */
function alreadySatisfied(object: DetectedObject, rule: Rule, objects: DetectedObject[]): boolean {
  if (object.attributes.occupied === true) return true;
  if (rule.satisfiedBy.length === 0) return false;

  return objects.some(
    (other) =>
      other.id !== object.id &&
      rule.satisfiedBy.includes(other.type) &&
      boxOverlap(object.boundingBox, other.boundingBox) > rule.satisfiedAt,
  );
}

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * Derives the decoration opportunities for an analysed room.
 *
 * Ordered by priority and capped, because a photograph covered in dots is not
 * an insight — it is a heat map of the catalogue.
 */
export function deriveOpportunities(
  objects: DetectedObject[],
  context: Context,
): Opportunity[] {
  const candidates: Opportunity[] = [];

  for (const object of objects) {
    if (object.confidence < MIN_RENDER_CONFIDENCE) continue;

    for (const rule of RULES[object.type] ?? []) {
      if (EXCLUSIONS[rule.type]?.includes(context.roomType)) continue;
      if (rule.applies && !rule.applies(object, context)) continue;
      if (alreadySatisfied(object, rule, objects)) continue;

      const region = rule.region(object);
      const priority = clamp(
        rule.basePriority +
          (object.confidence - MIN_RENDER_CONFIDENCE) * 0.25 +
          (rule.adjust?.(context) ?? 0),
        0,
        1,
      );

      candidates.push({
        id: createId('opp'),
        type: rule.type,
        targetObjectId: object.id,
        anchor: clampPoint(rule.anchor(region)),
        region,
        placement: rule.placement,
        title: rule.title,
        rationale: rule.rationale,
        recommendedCategories: rule.categories,
        priority,
      });
    }
  }

  // Highest priority wins any spatial collision, so the strongest idea in a
  // given part of the room is the one the user sees.
  const kept: Opportunity[] = [];
  for (const candidate of candidates.sort((a, b) => b.priority - a.priority)) {
    if (kept.some((existing) => distance(existing.anchor, candidate.anchor) < MIN_ANCHOR_SEPARATION)) {
      continue;
    }
    kept.push(candidate);
    if (kept.length >= MAX_VISIBLE_HOTSPOTS) break;
  }

  return kept;
}

/** Keeps a hotspot inside the frame, with room for its own touch target. */
function clampPoint(point: Point): Point {
  return { x: clamp(point.x, 0.06, 0.94), y: clamp(point.y, 0.06, 0.94) };
}

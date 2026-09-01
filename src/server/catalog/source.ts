import type { Availability, Product, ProductCategory, RoomType, StyleTag } from '@/types/domain';

/**
 * The retailer boundary.
 *
 * One `ProductSource` per retailer. Each knows how to search its own catalogue
 * and how to translate the result into the app's `Product` model; nothing above
 * this layer knows which retailers exist, so adding one is a new file and a
 * registry entry.
 *
 * Sources run server-side only. Retailer credentials never reach the browser.
 *
 * A source that is not configured is simply absent from the registry — it is
 * never a half-working entry that yields empty results and looks like a bug.
 */

export interface SourceQuery {
  /** Search terms, already derived from the opportunity's categories. */
  keywords: string;
  category: ProductCategory;
  roomType?: RoomType;
  limit: number;
  /** Upper bound in the source's own currency, when the user has set one. */
  maxPrice?: number;
  signal?: AbortSignal;
}

export interface ProductSource {
  /** Stable id, also used as the `Retailer.id`. */
  readonly id: string;
  readonly name: string;
  readonly shortName: string;
  /** ISO 3166-1 alpha-2 markets this retailer actually ships to. */
  readonly shipsTo: string[];
  /** True once the environment holds everything this source needs. */
  isConfigured(): boolean;
  search(query: SourceQuery): Promise<Product[]>;
}

export class SourceError extends Error {
  constructor(
    readonly sourceId: string,
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = 'SourceError';
  }
}

/* -- Normalisation helpers, shared by every adapter ------------------------ */

/**
 * Search terms per category.
 *
 * Retailer search engines respond to the words shoppers use, which are not the
 * app's internal category names — nobody searches for "wall_art".
 */
export const CATEGORY_KEYWORDS: Record<ProductCategory, string> = {
  curtains: 'curtains eyelet lined',
  blinds: 'window blind roller',
  curtain_rods: 'curtain pole rod bracket',
  wall_art: 'framed wall art print',
  mirrors: 'wall mirror round',
  shelving: 'floating wall shelf',
  rugs: 'area rug living room',
  floor_lamps: 'floor lamp standing',
  table_lamps: 'table lamp bedside',
  pendant_lights: 'pendant ceiling light shade',
  plants: 'indoor plant potted',
  planters: 'plant pot planter indoor',
  cushions: 'cushion cover throw pillow',
  throws: 'throw blanket sofa',
  side_tables: 'side table end table',
  media_console: 'tv stand media console',
  bedding: 'duvet cover set bedding',
  headboards: 'headboard bed',
  baskets: 'storage basket woven',
  vases: 'vase ceramic decorative',
  pegboards: 'pegboard wall organiser desk',
  noticeboards: 'cork noticeboard memo board',
  wall_clocks: 'wall clock silent',
  hanging_plants: 'hanging plant macrame planter',
  floor_cushions: 'floor cushion pouffe ottoman',
};

/** Keeps a title readable on a product card. */
export function tidyTitle(raw: string): string {
  const cleaned = raw
    .replace(/\s+/g, ' ')
    .replace(/[|–—-]\s*(free (uk )?(delivery|shipping)|best seller|new).*/i, '')
    .trim();
  return cleaned.length > 68 ? `${cleaned.slice(0, 65).trimEnd()}…` : cleaned;
}

/** Guesses styles from a listing's own words. Absent is better than wrong. */
export function inferStyles(text: string): StyleTag[] {
  const haystack = text.toLowerCase();
  const table: [StyleTag, RegExp][] = [
    ['minimal', /minimal|simple|plain/],
    ['scandinavian', /scandi|nordic/],
    ['mid_century', /mid.?century|retro/],
    ['traditional', /traditional|classic|victorian/],
    ['industrial', /industrial|loft/],
    ['japandi', /japandi|wabi|zen/],
    ['coastal', /coastal|nautical|beach/],
    ['rustic', /rustic|farmhouse|reclaimed/],
    ['eclectic', /eclectic|boho|bohemian/],
    ['contemporary', /modern|contemporary/],
  ];
  return table.filter(([, pattern]) => pattern.test(haystack)).map(([style]) => style).slice(0, 3);
}

/** Rooms a category is plausible in, so a real listing still filters sensibly. */
export const CATEGORY_ROOMS: Record<ProductCategory, RoomType[]> = {
  curtains: ['living_room', 'bedroom', 'dining_room', 'home_office', 'nursery'],
  blinds: ['living_room', 'bedroom', 'kitchen', 'bathroom', 'home_office'],
  curtain_rods: ['living_room', 'bedroom', 'dining_room', 'home_office', 'nursery'],
  wall_art: ['living_room', 'bedroom', 'dining_room', 'home_office', 'hallway'],
  mirrors: ['living_room', 'bedroom', 'hallway', 'bathroom'],
  shelving: ['living_room', 'bedroom', 'home_office', 'kitchen'],
  rugs: ['living_room', 'bedroom', 'dining_room', 'home_office'],
  floor_lamps: ['living_room', 'bedroom', 'home_office'],
  table_lamps: ['living_room', 'bedroom', 'home_office'],
  pendant_lights: ['living_room', 'bedroom', 'dining_room', 'kitchen'],
  plants: ['living_room', 'bedroom', 'home_office', 'hallway'],
  planters: ['living_room', 'bedroom', 'home_office', 'hallway'],
  cushions: ['living_room', 'bedroom', 'nursery'],
  throws: ['living_room', 'bedroom'],
  side_tables: ['living_room', 'bedroom'],
  media_console: ['living_room'],
  bedding: ['bedroom', 'nursery'],
  headboards: ['bedroom'],
  baskets: ['living_room', 'bedroom', 'bathroom', 'nursery', 'hallway'],
  vases: ['living_room', 'bedroom', 'dining_room', 'hallway'],
  pegboards: ['home_office', 'kitchen', 'bedroom'],
  noticeboards: ['home_office', 'kitchen', 'nursery', 'hallway'],
  wall_clocks: ['living_room', 'kitchen', 'home_office', 'hallway', 'bedroom'],
  hanging_plants: ['living_room', 'bedroom', 'home_office', 'bathroom', 'hallway'],
  floor_cushions: ['living_room', 'bedroom', 'nursery', 'home_office'],
};

/**
 * Placement defaults for a real listing.
 *
 * A retailer feed says what a thing costs, not how it hangs. These are the same
 * figures the reference catalogue uses, applied by category, so a live product
 * composites into a room with correct scale without the retailer knowing
 * anything about our visualiser.
 */
export const CATEGORY_PLACEMENT: Record<
  ProductCategory,
  { aspectRatio: number; coverage: number; placements: Product['supportedPlacements'] }
> = {
  curtains: { aspectRatio: 1.1, coverage: 1, placements: ['overlay_surface'] },
  blinds: { aspectRatio: 1.4, coverage: 0.96, placements: ['overlay_surface'] },
  curtain_rods: { aspectRatio: 11, coverage: 1, placements: ['overlay_surface'] },
  wall_art: { aspectRatio: 0.76, coverage: 0.32, placements: ['mounted'] },
  mirrors: { aspectRatio: 0.68, coverage: 0.3, placements: ['mounted'] },
  shelving: { aspectRatio: 3.1, coverage: 0.55, placements: ['mounted'] },
  rugs: { aspectRatio: 1.6, coverage: 1, placements: ['overlay_surface'] },
  floor_lamps: { aspectRatio: 0.28, coverage: 0.86, placements: ['standing'] },
  table_lamps: { aspectRatio: 0.82, coverage: 0.6, placements: ['resting', 'standing'] },
  pendant_lights: { aspectRatio: 0.9, coverage: 0.3, placements: ['mounted'] },
  plants: { aspectRatio: 0.72, coverage: 0.8, placements: ['standing'] },
  planters: { aspectRatio: 0.9, coverage: 0.3, placements: ['standing'] },
  cushions: { aspectRatio: 1, coverage: 0.62, placements: ['resting'] },
  throws: { aspectRatio: 1.3, coverage: 0.72, placements: ['resting'] },
  side_tables: { aspectRatio: 0.85, coverage: 0.38, placements: ['standing'] },
  media_console: { aspectRatio: 2.6, coverage: 0.34, placements: ['standing'] },
  bedding: { aspectRatio: 1.5, coverage: 1, placements: ['overlay_surface', 'resting'] },
  headboards: { aspectRatio: 1.8, coverage: 0.9, placements: ['mounted'] },
  baskets: { aspectRatio: 0.9, coverage: 0.3, placements: ['standing', 'resting'] },
  vases: { aspectRatio: 0.45, coverage: 0.5, placements: ['resting'] },
  pegboards: { aspectRatio: 1.4, coverage: 0.4, placements: ['mounted'] },
  noticeboards: { aspectRatio: 1.35, coverage: 0.38, placements: ['mounted'] },
  wall_clocks: { aspectRatio: 1, coverage: 0.16, placements: ['mounted'] },
  hanging_plants: { aspectRatio: 0.6, coverage: 0.17, placements: ['mounted'] },
  floor_cushions: { aspectRatio: 1.25, coverage: 0.3, placements: ['standing', 'resting'] },
};

export interface NormaliseInput {
  sourceId: string;
  externalId: string;
  title: string;
  price: number;
  currency: string;
  imageUrl: string;
  productUrl: string;
  category: ProductCategory;
  availability?: Availability;
  material?: string;
  color?: string;
  colorHex?: string;
  tags?: string[];
  rating?: { average: number; count: number };
}

/** Turns one retailer listing into the app's product model. */
export function normalise(input: NormaliseInput): Product {
  const placement = CATEGORY_PLACEMENT[input.category];
  const title = tidyTitle(input.title);

  return {
    id: `${input.sourceId}:${input.externalId}`,
    name: title,
    category: input.category,
    retailerId: input.sourceId,
    image: {
      // Served through this origin so the compositor can read the canvas back
      // without cross-origin tainting; see /api/image.
      src: `/api/image?src=${encodeURIComponent(input.imageUrl)}`,
      alt: title,
      aspectRatio: placement.aspectRatio,
      // Retailer photography has a background. The compositor keys it out; see
      // `keyOutBackground` in the visualisation layer.
      hasTransparency: false,
    },
    gallery: [],
    price: input.price,
    currency: input.currency,
    color: input.color ?? 'As shown',
    colorHex: input.colorHex ?? '#c9c2b6',
    material: input.material ?? 'See listing',
    styles: inferStyles(`${input.title} ${(input.tags ?? []).join(' ')}`),
    availability: input.availability ?? 'in_stock',
    url: input.productUrl,
    tags: (input.tags ?? []).slice(0, 8),
    roomCompatibility: CATEGORY_ROOMS[input.category],
    supportedPlacements: placement.placements,
    coverage: placement.coverage,
    ...(input.rating ? { rating: input.rating } : {}),
  };
}

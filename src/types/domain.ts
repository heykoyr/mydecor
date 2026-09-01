/**
 * The product's domain model.
 *
 * Two rules hold this file together:
 *
 * 1. Geometry is always normalised (0-1) against the source image, never pixels.
 *    The same analysis then drives a 320px thumbnail and a 4032px original
 *    without a single conversion bug.
 * 2. Application logic never reads free-form model prose. Anything the UI
 *    branches on is a literal union declared here; anything the model writes
 *    freely is confined to fields the UI only ever displays (`rationale`,
 *    `notes`).
 */

/* -- Geometry -------------------------------------------------------------- */

/** A point in normalised image space. Origin is top-left. */
export interface Point {
  x: number;
  y: number;
}

/** Axis-aligned region in normalised image space. */
export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * A perspective-aware surface: four corners in clockwise order from top-left.
 *
 * This is what makes in-room previews look placed rather than pasted. A rug on
 * a floor and art on an angled wall need a quad; a bounding box would leave
 * them floating flat against the camera plane.
 */
export interface Quad {
  topLeft: Point;
  topRight: Point;
  bottomRight: Point;
  bottomLeft: Point;
}

/* -- Room capture ---------------------------------------------------------- */

export interface CapturedImage {
  /** Data URL for display and compositing. */
  src: string;
  width: number;
  height: number;
  /** Bytes after client-side compression. */
  byteSize: number;
  capturedAt: string;
  source: 'camera' | 'upload';
}

export const ROOM_TYPES = [
  'living_room',
  'bedroom',
  'dining_room',
  'kitchen',
  'home_office',
  'hallway',
  'bathroom',
  'nursery',
  'outdoor',
  'other',
] as const;
export type RoomType = (typeof ROOM_TYPES)[number];

export const STYLE_TAGS = [
  'minimal',
  'scandinavian',
  'mid_century',
  'contemporary',
  'traditional',
  'industrial',
  'japandi',
  'coastal',
  'eclectic',
  'rustic',
] as const;
export type StyleTag = (typeof STYLE_TAGS)[number];

export interface PaletteColor {
  hex: string;
  /** Share of the image occupied by this colour, 0-1. */
  weight: number;
  role: 'dominant' | 'secondary' | 'accent';
}

/* -- Detection ------------------------------------------------------------- */

export const OBJECT_TYPES = [
  'wall',
  'window',
  'door',
  'floor',
  'ceiling',
  'sofa',
  'chair',
  'table',
  'bed',
  'desk',
  'tv',
  'corner',
  'lighting',
  'curtains',
  'rug',
  'shelving',
  'plant',
  'artwork',
  'mirror',
  'storage',
  'decor',
] as const;
export type ObjectType = (typeof OBJECT_TYPES)[number];

export interface DetectedObject {
  id: string;
  type: ObjectType;
  boundingBox: BoundingBox;
  /** Present for placeable surfaces (walls, floors, windows). */
  surface?: Quad;
  /** 0-1. Below `MIN_RENDER_CONFIDENCE` the object is kept but not surfaced. */
  confidence: number;
  attributes: {
    /** Rough share of the frame, 0-1. Drives "is there room for this?" logic. */
    coverage?: number;
    dominantColor?: string;
    occupied?: boolean;
    orientation?: 'frontal' | 'angled' | 'oblique';
    notes?: string;
  };
}

/* -- Opportunities --------------------------------------------------------- */

export const OPPORTUNITY_TYPES = [
  'soften_window',
  'dress_empty_wall',
  'ground_the_floor',
  'fill_empty_corner',
  'layer_the_sofa',
  'light_the_room',
  'style_the_surface',
  'dress_the_bed',
  'anchor_the_tv_wall',
  'add_greenery',
] as const;
export type OpportunityType = (typeof OPPORTUNITY_TYPES)[number];

export const PRODUCT_CATEGORIES = [
  'curtains',
  'blinds',
  'curtain_rods',
  'wall_art',
  'mirrors',
  'shelving',
  'rugs',
  'floor_lamps',
  'table_lamps',
  'pendant_lights',
  'plants',
  'planters',
  'cushions',
  'throws',
  'side_tables',
  'media_console',
  'bedding',
  'headboards',
  'baskets',
  'vases',
] as const;
export type ProductCategory = (typeof PRODUCT_CATEGORIES)[number];

/**
 * How a product should be composited onto the target surface. Chosen by the
 * opportunity, not by the product, because the same lamp behaves differently
 * standing in a corner and sitting on a table.
 */
export type PlacementMode =
  | 'overlay_surface' // fills the quad: curtains on a window, a rug on the floor
  | 'mounted' // hangs centred on a wall quad: art, mirrors, shelves
  | 'standing' // rests on the floor line, scaled by depth: lamps, plants
  | 'resting'; // sits on top of an object: cushions, vases

export interface Opportunity {
  id: string;
  type: OpportunityType;
  /** `DetectedObject.id` this opportunity is anchored to. */
  targetObjectId: string;
  /** Where the hotspot dot sits, normalised. */
  anchor: Point;
  /** The region a product will be placed into. */
  region: Quad;
  placement: PlacementMode;
  /** Short, human title shown on the hotspot sheet. */
  title: string;
  /** One sentence of "why here" - displayed, never parsed. */
  rationale: string;
  recommendedCategories: ProductCategory[];
  /** Ranking weight, 0-1. The highest-priority opportunity opens first. */
  priority: number;
}

/* -- Analysis -------------------------------------------------------------- */

export type AnalysisQualityIssue =
  | 'too_dark'
  | 'too_bright'
  | 'blurry'
  | 'too_close'
  | 'no_room_detected'
  | 'low_resolution';

export interface RoomAnalysis {
  id: string;
  roomId: string;
  roomType: RoomType;
  /** Confidence in `roomType` specifically, 0-1. */
  roomTypeConfidence: number;
  styles: StyleTag[];
  palette: PaletteColor[];
  lighting: 'bright' | 'natural' | 'dim' | 'artificial';
  detectedObjects: DetectedObject[];
  opportunities: Opportunity[];
  /** Non-fatal quality problems worth telling the user about. */
  qualityIssues: AnalysisQualityIssue[];
  provider: string;
  /** True when produced without a vision model - surfaced in the UI. */
  isHeuristic: boolean;
  analysedAt: string;
  durationMs: number;
}

/* -- Commerce -------------------------------------------------------------- */

export interface Retailer {
  id: string;
  name: string;
  /** Shown on product cards for provenance. */
  shortName: string;
  affiliateProgram: boolean;
  /** Applied to `Product.url` when building an outbound link. */
  affiliateParam?: string;
  shipsTo: string[];
}

export interface Dimensions {
  /** Centimetres. Any axis may be absent for soft goods. */
  width?: number;
  height?: number;
  depth?: number;
  diameter?: number;
}

export type Availability = 'in_stock' | 'low_stock' | 'made_to_order' | 'out_of_stock';

export interface ProductImage {
  /** An asset path, or a `data:`/`https:` URL. */
  src: string;
  alt: string;
  /** Intrinsic aspect ratio (w/h), used to reserve layout space. */
  aspectRatio: number;
  /** True when the artwork has an alpha channel and can be composited. */
  hasTransparency: boolean;
}

export interface Product {
  id: string;
  name: string;
  category: ProductCategory;
  subcategory?: string;
  retailerId: string;
  /** Primary cut-out image used for both the card and in-room compositing. */
  image: ProductImage;
  gallery: ProductImage[];
  price: number;
  /** ISO 4217. */
  currency: string;
  dimensions?: Dimensions;
  color: string;
  colorHex: string;
  material: string;
  styles: StyleTag[];
  availability: Availability;
  /** Canonical retailer product page. */
  url: string;
  tags: string[];
  roomCompatibility: RoomType[];
  /** Placement modes this product's artwork supports being rendered in. */
  supportedPlacements: PlacementMode[];
  /**
   * Fraction of the target region the product should occupy by default.
   * A rug fills its quad; a mirror takes about a third of a wall.
   */
  coverage: number;
  rating?: { average: number; count: number };
  metadata?: Record<string, string>;
}

export interface RecommendationFactors {
  categoryRelevance: number;
  styleMatch: number;
  paletteMatch: number;
  sizeFit: number;
  priceFit: number;
  availability: number;
  popularity: number;
}

export interface Recommendation {
  product: Product;
  /** Final blended score, 0-1. Never shown to the user. */
  score: number;
  /** Per-factor contributions, kept for tuning and analytics. */
  factors: RecommendationFactors;
  /** One plain sentence explaining the match, shown on product detail. */
  reason: string;
}

/* -- Visualisation --------------------------------------------------------- */

export type VisualizationStatus = 'idle' | 'generating' | 'ready' | 'partial' | 'failed';

export interface Visualization {
  id: string;
  roomId: string;
  opportunityId: string;
  productId: string;
  status: VisualizationStatus;
  /** Data URL of the composed result. Absent until `ready`/`partial`. */
  resultSrc?: string;
  provider: string;
  /**
   * How literally the result should be read. `indicative` means we placed the
   * product plausibly but have no measurements - the UI says so.
   */
  fidelity: 'indicative' | 'measured';
  failureReason?: string;
  createdAt: string;
  durationMs: number;
}

/* -- Persistence ----------------------------------------------------------- */

export interface Room {
  id: string;
  /** User-facing name; defaults to the detected room type. */
  name: string;
  image: CapturedImage;
  /** Small inline data URL used for lists, so grids never load originals. */
  thumbnail: string;
  analysis?: RoomAnalysis;
  createdAt: string;
  updatedAt: string;
}

export interface SavedProduct {
  productId: string;
  savedAt: string;
  /** Where it was saved from, for "seen in your bedroom" context. */
  fromRoomId?: string;
  fromOpportunityId?: string;
  /**
   * The product as it was when saved.
   *
   * A live retailer catalogue has no by-id endpoint and its listings are
   * withdrawn, so re-resolving a saved id after a reload is not reliable. The
   * snapshot is also the honest record of what the user actually saved — the
   * price they saw, not today's.
   */
  product?: Product;
}

export interface UserPreferences {
  /** Inclusive price bounds in the user's currency, or null for no limit. */
  budget: { min: number; max: number | null } | null;
  preferredStyles: StyleTag[];
  currency: string;
  theme: 'system' | 'light' | 'dark';
}

/* -- Analytics ------------------------------------------------------------- */

export const ANALYTICS_EVENTS = [
  'photo_started',
  'photo_uploaded',
  'photo_retaken',
  'analysis_started',
  'analysis_completed',
  'analysis_failed',
  'hotspot_viewed',
  'hotspot_selected',
  'product_viewed',
  'preview_started',
  'preview_completed',
  'preview_failed',
  'product_saved',
  'product_unsaved',
  'shop_clicked',
  'room_saved',
  'room_deleted',
  'share_clicked',
] as const;
export type AnalyticsEventName = (typeof ANALYTICS_EVENTS)[number];

export interface AnalyticsEvent {
  id: string;
  name: AnalyticsEventName;
  properties: Record<string, string | number | boolean | undefined>;
  /** Groups every event from one scan-to-purchase journey. */
  sessionId: string;
  timestamp: string;
}

/* -- Shared constants ------------------------------------------------------ */

/** Objects below this confidence are stored but never rendered as hotspots. */
export const MIN_RENDER_CONFIDENCE = 0.45;

/** Hard cap on simultaneously visible hotspots - beyond this the room is noise. */
export const MAX_VISIBLE_HOTSPOTS = 6;

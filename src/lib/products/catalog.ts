import type {
  Availability,
  Dimensions,
  PlacementMode,
  Product,
  ProductCategory,
  Retailer,
  RoomType,
  StyleTag,
} from '@/types/domain';
import { renderArtwork } from './artwork';

/**
 * The reference catalogue.
 *
 * Structurally identical to a production feed — every field a real retailer
 * integration would populate is populated here, including the ones nothing
 * currently reads, so that connecting a live catalogue is a change of data
 * source rather than a change of shape.
 *
 * What it is not is purchasable. `CATALOG_IS_REFERENCE` says so, and the UI
 * reads that flag to state plainly that retailer links are not connected rather
 * than presenting a checkout path that goes nowhere.
 */

export const CATALOG_IS_REFERENCE = true;

export const RETAILERS: Retailer[] = [
  {
    id: 'ret_northfold',
    name: 'Northfold Supply',
    shortName: 'Northfold',
    affiliateProgram: true,
    affiliateParam: 'ref',
    shipsTo: ['GB', 'IE'],
  },
  {
    id: 'ret_marlow',
    name: 'Marlow & Co.',
    shortName: 'Marlow',
    affiliateProgram: true,
    affiliateParam: 'partner',
    shipsTo: ['GB'],
  },
  {
    id: 'ret_kestrel',
    name: 'Kestrel Home',
    shortName: 'Kestrel',
    affiliateProgram: false,
    shipsTo: ['GB', 'IE', 'FR', 'DE'],
  },
];

/**
 * Placement and framing defaults per category, applied to every product.
 *
 * `coverage` is read against different axes depending on the placement mode —
 * width for surface-filling and wall-mounted items, height for anything that
 * stands on a floor or rests on furniture. See `placementQuad`.
 */
const CATEGORY_DEFAULTS: Record<
  ProductCategory,
  { aspectRatio: number; coverage: number; placements: PlacementMode[] }
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
};

interface Draft {
  id: string;
  name: string;
  category: ProductCategory;
  subcategory?: string;
  retailerId: string;
  price: number;
  color: string;
  colorHex: string;
  /** Frame, pot, base or trim colour, where the artwork has one. */
  accentHex?: string;
  material: string;
  styles: StyleTag[];
  dimensions?: Dimensions;
  rooms: RoomType[];
  tags: string[];
  availability?: Availability;
  rating?: { average: number; count: number };
  /** Overrides the category default when this item is unusually sized. */
  coverage?: number;
}

function build(draft: Draft): Product {
  const defaults = CATEGORY_DEFAULTS[draft.category];
  const alt = `${draft.name}, ${draft.color} ${draft.material}`;

  return {
    id: draft.id,
    name: draft.name,
    category: draft.category,
    ...(draft.subcategory ? { subcategory: draft.subcategory } : {}),
    retailerId: draft.retailerId,
    image: {
      src: renderArtwork(draft.category, {
        hex: draft.colorHex,
        ...(draft.accentHex ? { accentHex: draft.accentHex } : {}),
        aspectRatio: defaults.aspectRatio,
      }),
      alt,
      aspectRatio: defaults.aspectRatio,
      hasTransparency: true,
    },
    gallery: [],
    price: draft.price,
    currency: 'GBP',
    ...(draft.dimensions ? { dimensions: draft.dimensions } : {}),
    color: draft.color,
    colorHex: draft.colorHex,
    material: draft.material,
    styles: draft.styles,
    availability: draft.availability ?? 'in_stock',
    // Deliberately not a live destination; see CATALOG_IS_REFERENCE.
    url: `https://example.com/${draft.retailerId}/${draft.id}`,
    tags: draft.tags,
    roomCompatibility: draft.rooms,
    supportedPlacements: defaults.placements,
    coverage: draft.coverage ?? defaults.coverage,
    ...(draft.rating ? { rating: draft.rating } : {}),
  };
}

const LIVING = ['living_room', 'home_office', 'dining_room'] as RoomType[];
const SLEEPING = ['bedroom', 'nursery'] as RoomType[];
const ANYWHERE = [
  'living_room',
  'bedroom',
  'dining_room',
  'home_office',
  'hallway',
  'nursery',
] as RoomType[];

const DRAFTS: Draft[] = [
  /* Window treatments */
  {
    id: 'p_curtain_linen_oat',
    name: 'Washed Linen Curtains',
    category: 'curtains',
    subcategory: 'Blackout lined',
    retailerId: 'ret_northfold',
    price: 89,
    color: 'Oatmeal',
    colorHex: '#d9cfbe',
    material: 'Washed linen',
    styles: ['minimal', 'scandinavian', 'japandi'],
    dimensions: { width: 168, height: 229 },
    rooms: ANYWHERE,
    tags: ['blackout', 'machine washable', 'pencil pleat'],
    rating: { average: 4.6, count: 812 },
  },
  {
    id: 'p_curtain_velvet_moss',
    name: 'Cotton Velvet Curtains',
    category: 'curtains',
    retailerId: 'ret_marlow',
    price: 145,
    color: 'Moss',
    colorHex: '#6b7458',
    material: 'Cotton velvet',
    styles: ['traditional', 'eclectic', 'mid_century'],
    dimensions: { width: 168, height: 229 },
    rooms: [...LIVING, ...SLEEPING],
    tags: ['heavyweight', 'thermal', 'eyelet'],
    rating: { average: 4.8, count: 340 },
  },
  {
    id: 'p_curtain_sheer_white',
    name: 'Sheer Voile Panels',
    category: 'curtains',
    subcategory: 'Sheer',
    retailerId: 'ret_kestrel',
    price: 38,
    color: 'Chalk',
    colorHex: '#f0ece5',
    material: 'Voile',
    styles: ['coastal', 'minimal', 'contemporary'],
    dimensions: { width: 145, height: 229 },
    rooms: ANYWHERE,
    tags: ['light filtering', 'layering'],
    rating: { average: 4.3, count: 1204 },
  },
  {
    id: 'p_blind_wood_walnut',
    name: 'Wooden Venetian Blind',
    category: 'blinds',
    retailerId: 'ret_northfold',
    price: 72,
    color: 'Walnut',
    colorHex: '#7a5638',
    material: 'Basswood',
    styles: ['mid_century', 'traditional', 'industrial'],
    dimensions: { width: 120, height: 160 },
    rooms: [...LIVING, 'kitchen', 'bathroom'],
    tags: ['made to measure', 'privacy'],
    availability: 'made_to_order',
    rating: { average: 4.5, count: 210 },
  },
  {
    id: 'p_blind_roman_flax',
    name: 'Roman Blind in Flax',
    category: 'blinds',
    retailerId: 'ret_marlow',
    price: 96,
    color: 'Flax',
    colorHex: '#cbbda6',
    material: 'Linen blend',
    styles: ['scandinavian', 'contemporary', 'coastal'],
    dimensions: { width: 100, height: 170 },
    rooms: ANYWHERE,
    tags: ['soft fold', 'chain operated'],
    rating: { average: 4.7, count: 156 },
  },
  {
    id: 'p_rod_brass',
    name: 'Solid Brass Curtain Pole',
    category: 'curtain_rods',
    retailerId: 'ret_kestrel',
    price: 44,
    color: 'Antique brass',
    colorHex: '#a98545',
    material: 'Solid brass',
    styles: ['traditional', 'mid_century', 'eclectic'],
    dimensions: { width: 240, diameter: 2.8 },
    rooms: ANYWHERE,
    tags: ['extendable', 'includes brackets'],
    rating: { average: 4.4, count: 98 },
  },

  /* Walls */
  {
    id: 'p_art_dune',
    name: 'Dune Study, Framed Print',
    category: 'wall_art',
    retailerId: 'ret_marlow',
    price: 68,
    color: 'Sand',
    colorHex: '#c9a882',
    accentHex: '#3a352d',
    material: 'Giclée print, oak frame',
    styles: ['minimal', 'japandi', 'coastal'],
    dimensions: { width: 50, height: 70 },
    rooms: ANYWHERE,
    tags: ['framed', 'ready to hang'],
    rating: { average: 4.7, count: 421 },
  },
  {
    id: 'p_art_slate',
    name: 'Slate Form, Framed Print',
    category: 'wall_art',
    retailerId: 'ret_northfold',
    price: 54,
    color: 'Slate',
    colorHex: '#5c6470',
    accentHex: '#20201d',
    material: 'Matte print, ash frame',
    styles: ['contemporary', 'industrial', 'minimal'],
    dimensions: { width: 40, height: 50 },
    rooms: ANYWHERE,
    tags: ['framed', 'gallery wall'],
    rating: { average: 4.5, count: 265 },
  },
  {
    id: 'p_art_terracotta',
    name: 'Terracotta Arch, Framed Print',
    category: 'wall_art',
    retailerId: 'ret_kestrel',
    price: 82,
    color: 'Terracotta',
    colorHex: '#b4664a',
    accentHex: '#4a4038',
    material: 'Cotton rag print, walnut frame',
    styles: ['mid_century', 'eclectic', 'rustic'],
    dimensions: { width: 60, height: 80 },
    rooms: ANYWHERE,
    tags: ['framed', 'statement'],
    rating: { average: 4.8, count: 173 },
  },
  {
    id: 'p_mirror_arched_oak',
    name: 'Arched Oak Mirror',
    category: 'mirrors',
    retailerId: 'ret_northfold',
    price: 165,
    color: 'Natural oak',
    colorHex: '#dfe6ea',
    accentHex: '#b98f5c',
    material: 'Solid oak, bevelled glass',
    styles: ['scandinavian', 'contemporary', 'japandi'],
    dimensions: { width: 60, height: 90, depth: 3 },
    rooms: ANYWHERE,
    tags: ['bounces light', 'wall mounted'],
    rating: { average: 4.9, count: 302 },
  },
  {
    id: 'p_mirror_round_black',
    name: 'Round Metal Mirror',
    category: 'mirrors',
    retailerId: 'ret_kestrel',
    price: 98,
    color: 'Matte black',
    colorHex: '#e2e6e8',
    accentHex: '#2b2a28',
    material: 'Powder-coated steel',
    styles: ['industrial', 'contemporary', 'minimal'],
    dimensions: { diameter: 70, depth: 3 },
    rooms: ANYWHERE,
    tags: ['wall mounted', 'hallway'],
    rating: { average: 4.4, count: 511 },
  },
  {
    id: 'p_shelf_oak_pair',
    name: 'Floating Oak Shelves, Set of Three',
    category: 'shelving',
    retailerId: 'ret_marlow',
    price: 74,
    color: 'Oiled oak',
    colorHex: '#c69a68',
    material: 'Solid oak',
    styles: ['scandinavian', 'minimal', 'rustic'],
    dimensions: { width: 80, height: 4, depth: 20 },
    rooms: ANYWHERE,
    tags: ['concealed fixings', 'set of three'],
    rating: { average: 4.6, count: 389 },
  },

  /* Floor */
  {
    id: 'p_rug_wool_natural',
    name: 'Handwoven Wool Rug',
    category: 'rugs',
    retailerId: 'ret_northfold',
    price: 240,
    color: 'Natural',
    colorHex: '#cfc3b0',
    accentHex: '#8b7f6c',
    material: 'Wool',
    styles: ['scandinavian', 'minimal', 'rustic'],
    dimensions: { width: 240, height: 170 },
    rooms: [...LIVING, ...SLEEPING],
    tags: ['handwoven', 'natural fibre'],
    rating: { average: 4.8, count: 640 },
  },
  {
    id: 'p_rug_jute_round',
    name: 'Braided Jute Rug',
    category: 'rugs',
    retailerId: 'ret_kestrel',
    price: 118,
    color: 'Jute',
    colorHex: '#c2a878',
    accentHex: '#8a7550',
    material: 'Jute',
    styles: ['coastal', 'rustic', 'eclectic'],
    dimensions: { diameter: 200 },
    rooms: [...LIVING, 'hallway'],
    tags: ['hard wearing', 'natural fibre'],
    rating: { average: 4.2, count: 890 },
  },
  {
    id: 'p_rug_charcoal_low',
    name: 'Low Pile Rug',
    category: 'rugs',
    retailerId: 'ret_marlow',
    price: 175,
    color: 'Charcoal',
    colorHex: '#59575a',
    accentHex: '#cfcbc4',
    material: 'Recycled polyester',
    styles: ['contemporary', 'industrial', 'minimal'],
    dimensions: { width: 200, height: 140 },
    rooms: [...LIVING, 'home_office'],
    tags: ['stain resistant', 'underfloor heating safe'],
    availability: 'low_stock',
    rating: { average: 4.3, count: 276 },
  },

  /* Corners and light */
  {
    id: 'p_lamp_floor_arc',
    name: 'Slim Arc Floor Lamp',
    category: 'floor_lamps',
    retailerId: 'ret_kestrel',
    price: 132,
    color: 'Brushed brass',
    colorHex: '#9b7c47',
    accentHex: '#f2e8d5',
    material: 'Brushed brass, linen shade',
    styles: ['mid_century', 'contemporary', 'eclectic'],
    dimensions: { height: 160, diameter: 30 },
    rooms: LIVING,
    tags: ['dimmable', 'reading light'],
    rating: { average: 4.7, count: 244 },
  },
  {
    id: 'p_lamp_floor_black',
    name: 'Tripod Floor Lamp',
    category: 'floor_lamps',
    retailerId: 'ret_northfold',
    price: 95,
    color: 'Matte black',
    colorHex: '#2f2e2c',
    accentHex: '#e8e2d6',
    material: 'Steel, cotton shade',
    styles: ['industrial', 'minimal', 'scandinavian'],
    dimensions: { height: 150, diameter: 40 },
    rooms: [...LIVING, ...SLEEPING],
    tags: ['foot switch'],
    rating: { average: 4.4, count: 512 },
  },
  {
    id: 'p_lamp_table_ceramic',
    name: 'Ceramic Table Lamp',
    category: 'table_lamps',
    retailerId: 'ret_marlow',
    price: 78,
    color: 'Chalk white',
    colorHex: '#ddd6ca',
    accentHex: '#efe6d4',
    material: 'Glazed ceramic, linen shade',
    styles: ['japandi', 'coastal', 'traditional'],
    dimensions: { height: 45, diameter: 25 },
    rooms: ANYWHERE,
    tags: ['bedside', 'warm light'],
    rating: { average: 4.6, count: 331 },
  },
  {
    id: 'p_pendant_rattan',
    name: 'Woven Rattan Pendant',
    category: 'pendant_lights',
    retailerId: 'ret_kestrel',
    price: 110,
    color: 'Natural rattan',
    colorHex: '#c9a06a',
    material: 'Rattan',
    styles: ['coastal', 'rustic', 'eclectic'],
    dimensions: { diameter: 45, height: 35 },
    rooms: [...LIVING, ...SLEEPING],
    tags: ['diffuse light', 'ceiling fitting'],
    rating: { average: 4.5, count: 187 },
  },
  {
    id: 'p_plant_fig',
    name: 'Fiddle Leaf Fig, 140cm',
    category: 'plants',
    retailerId: 'ret_northfold',
    price: 65,
    color: 'Green',
    colorHex: '#4e6b45',
    accentHex: '#a9713f',
    material: 'Live plant, terracotta pot',
    styles: ['contemporary', 'scandinavian', 'eclectic'],
    dimensions: { height: 140, diameter: 24 },
    rooms: [...LIVING, ...SLEEPING],
    tags: ['bright indirect light', 'pot included'],
    rating: { average: 4.1, count: 723 },
  },
  {
    id: 'p_plant_palm',
    name: 'Kentia Palm, 120cm',
    category: 'plants',
    retailerId: 'ret_marlow',
    price: 58,
    color: 'Deep green',
    colorHex: '#3f5c3a',
    accentHex: '#8f8778',
    material: 'Live plant, stone pot',
    styles: ['coastal', 'traditional', 'minimal'],
    dimensions: { height: 120, diameter: 22 },
    rooms: ANYWHERE,
    tags: ['low light tolerant', 'pet safe'],
    rating: { average: 4.5, count: 398 },
  },
  {
    id: 'p_planter_stoneware',
    name: 'Stoneware Floor Planter',
    category: 'planters',
    retailerId: 'ret_kestrel',
    price: 42,
    color: 'Chalk',
    colorHex: '#d5cec2',
    material: 'Glazed stoneware',
    styles: ['japandi', 'minimal', 'contemporary'],
    dimensions: { height: 32, diameter: 28 },
    rooms: ANYWHERE,
    tags: ['drainage hole', 'indoor'],
    rating: { average: 4.4, count: 142 },
  },

  /* Soft furnishing */
  {
    id: 'p_cushion_boucle',
    name: 'Bouclé Cushion, 50cm',
    category: 'cushions',
    retailerId: 'ret_marlow',
    price: 32,
    color: 'Ivory',
    colorHex: '#e5ded1',
    material: 'Bouclé, feather insert',
    styles: ['contemporary', 'scandinavian', 'japandi'],
    dimensions: { width: 50, height: 50 },
    rooms: [...LIVING, ...SLEEPING],
    tags: ['feather filled', 'removable cover'],
    rating: { average: 4.7, count: 456 },
  },
  {
    id: 'p_cushion_rust',
    name: 'Linen Cushion, 45cm',
    category: 'cushions',
    retailerId: 'ret_northfold',
    price: 24,
    color: 'Rust',
    colorHex: '#a8583a',
    material: 'Washed linen',
    styles: ['rustic', 'eclectic', 'mid_century'],
    dimensions: { width: 45, height: 45 },
    rooms: [...LIVING, ...SLEEPING],
    tags: ['machine washable'],
    rating: { average: 4.5, count: 289 },
  },
  {
    id: 'p_throw_wool_stone',
    name: 'Lambswool Throw',
    category: 'throws',
    retailerId: 'ret_kestrel',
    price: 68,
    color: 'Stone',
    colorHex: '#b5aa99',
    material: 'Lambswool',
    styles: ['scandinavian', 'minimal', 'traditional'],
    dimensions: { width: 130, height: 180 },
    rooms: [...LIVING, ...SLEEPING],
    tags: ['fringed', 'warm'],
    rating: { average: 4.8, count: 512 },
  },
  {
    id: 'p_bedding_linen_clay',
    name: 'Washed Linen Duvet Set',
    category: 'bedding',
    retailerId: 'ret_northfold',
    price: 155,
    color: 'Clay',
    colorHex: '#b98d78',
    material: 'French flax linen',
    styles: ['rustic', 'minimal', 'japandi'],
    dimensions: { width: 200, height: 200 },
    rooms: SLEEPING,
    tags: ['stonewashed', 'breathable'],
    rating: { average: 4.9, count: 634 },
  },
  {
    id: 'p_bedding_cotton_white',
    name: 'Brushed Cotton Duvet Set',
    category: 'bedding',
    retailerId: 'ret_marlow',
    price: 89,
    color: 'White',
    colorHex: '#eceae4',
    material: 'Brushed cotton',
    styles: ['coastal', 'contemporary', 'scandinavian'],
    dimensions: { width: 200, height: 200 },
    rooms: SLEEPING,
    tags: ['soft', 'easy care'],
    rating: { average: 4.6, count: 878 },
  },

  /* Furniture and objects */
  {
    id: 'p_side_oak_round',
    name: 'Round Oak Side Table',
    category: 'side_tables',
    retailerId: 'ret_marlow',
    price: 128,
    color: 'Oak',
    colorHex: '#bb8f5e',
    material: 'Solid oak',
    styles: ['mid_century', 'scandinavian', 'minimal'],
    dimensions: { height: 50, diameter: 45 },
    rooms: LIVING,
    tags: ['solid wood', 'assembly required'],
    rating: { average: 4.6, count: 201 },
  },
  {
    id: 'p_console_walnut',
    name: 'Walnut Media Console',
    category: 'media_console',
    retailerId: 'ret_northfold',
    price: 420,
    color: 'Walnut',
    colorHex: '#6b4a30',
    material: 'Walnut veneer',
    styles: ['mid_century', 'contemporary'],
    dimensions: { width: 160, height: 48, depth: 40 },
    rooms: LIVING,
    tags: ['cable management', 'two doors'],
    availability: 'low_stock',
    rating: { average: 4.7, count: 118 },
  },
  {
    id: 'p_vase_stone_tall',
    name: 'Tall Stoneware Vase',
    category: 'vases',
    retailerId: 'ret_kestrel',
    price: 36,
    color: 'Sand',
    colorHex: '#cdbda3',
    material: 'Stoneware',
    styles: ['japandi', 'minimal', 'rustic'],
    dimensions: { height: 38, diameter: 14 },
    rooms: ANYWHERE,
    tags: ['watertight', 'dried stems'],
    rating: { average: 4.5, count: 167 },
  },
  {
    id: 'p_basket_seagrass',
    name: 'Seagrass Storage Basket',
    category: 'baskets',
    retailerId: 'ret_marlow',
    price: 29,
    color: 'Seagrass',
    colorHex: '#c4ab7e',
    material: 'Woven seagrass',
    styles: ['coastal', 'rustic', 'scandinavian'],
    dimensions: { height: 38, diameter: 40 },
    rooms: ANYWHERE,
    tags: ['handles', 'plant cover'],
    rating: { average: 4.4, count: 402 },
  },
];

export const PRODUCTS: Product[] = DRAFTS.map(build);

/**
 * The parameters each product's artwork was generated from.
 *
 * Kept so artwork can be re-rendered at a different aspect ratio. A product cut
 * to a surface — curtains on a window, a rug on a floor — must be laid out for
 * the shape of *that* surface: generate a curtain at 1.1 and stretch it across a
 * wide picture window and the folds smear sideways and the panels go squat.
 * Re-rendering at the target's aspect keeps every feature in proportion.
 *
 * A live catalogue has photographs rather than parameters, which is why this is
 * a detail of the static repository and not of the `Product` model.
 */
const ARTWORK_SPECS = new Map<string, { category: ProductCategory; hex: string; accentHex?: string }>(
  DRAFTS.map((draft) => [
    draft.id,
    {
      category: draft.category,
      hex: draft.colorHex,
      ...(draft.accentHex ? { accentHex: draft.accentHex } : {}),
    },
  ]),
);

/**
 * Re-renders a product's artwork for a given aspect ratio, or returns the
 * original when this product has no generative source.
 */
export function renderArtworkAtAspect(productId: string, aspectRatio: number): string | null {
  const spec = ARTWORK_SPECS.get(productId);
  if (!spec || !Number.isFinite(aspectRatio) || aspectRatio <= 0) return null;
  return renderArtwork(spec.category, {
    hex: spec.hex,
    ...(spec.accentHex ? { accentHex: spec.accentHex } : {}),
    aspectRatio,
  });
}

export const RETAILERS_BY_ID = new Map(RETAILERS.map((retailer) => [retailer.id, retailer]));

export function getRetailer(id: string): Retailer | undefined {
  return RETAILERS_BY_ID.get(id);
}

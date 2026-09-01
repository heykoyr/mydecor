import type {
  Availability,
  Dimensions,
  ProductCategory,
  RoomType,
  StyleTag,
} from '@/types/domain';

/**
 * The catalogue generator.
 *
 * Depth matters to this product: the ranking engine only becomes visible when a
 * hotspot has twenty candidates rather than three, and a room full of
 * suggestions is what the app is for. Hand-writing several hundred product
 * entries would be several thousand lines of data nobody can maintain.
 *
 * So the catalogue is composed instead. Each category declares the vocabulary a
 * real buyer would recognise — forms, materials, colourways, a price band, the
 * dimensions that category is actually sold in — and products are drawn from
 * the combinations. Adding twenty more of anything is one line of vocabulary,
 * not twenty more records.
 *
 * Everything here is deterministic. Product ids are derived from the category
 * and index, and every attribute comes from a seeded generator, so the
 * catalogue is identical on every load and in every environment. That is not a
 * detail: saved products are stored by id, and a catalogue that reshuffled
 * itself between sessions would quietly orphan them.
 */

/** How many products each category should end up with, curated ones included. */
export const TARGET_PER_CATEGORY = 20;

export interface ProductDraft {
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
  /**
   * Free-form attributes shown on product detail. For plants this carries the
   * care requirements, and `light` is read by the recommendation engine.
   */
  metadata?: Record<string, string>;
}

/* -- Deterministic randomness ---------------------------------------------- */

function hash(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** mulberry32 — small, fast, and stable across engines. */
function rng(seed: string): () => number {
  let state = hash(seed);
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(items: readonly T[], random: () => number): T {
  return items[Math.floor(random() * items.length)] ?? items[0]!;
}

/** Naira, rounded to something a price tag would actually read. */
function priceIn([low, high]: readonly [number, number], random: () => number): number {
  const raw = low + random() * (high - low);
  const step = raw > 100_000 ? 5000 : raw > 30_000 ? 1000 : 500;
  return Math.round(raw / step) * step;
}

/* -- Vocabulary ------------------------------------------------------------ */

interface Colourway {
  name: string;
  hex: string;
  accent?: string;
}

/**
 * A deliberately neutral-led palette. Interiors sell in warm neutrals with a
 * few accents; a uniformly colourful catalogue would look like a toy.
 */
const NEUTRALS: Colourway[] = [
  { name: 'Oatmeal', hex: '#d9cfbe' },
  { name: 'Chalk', hex: '#eee9e0' },
  { name: 'Flax', hex: '#cdbfa4' },
  { name: 'Stone', hex: '#b5aa99' },
  { name: 'Clay', hex: '#b98d78' },
  { name: 'Charcoal', hex: '#59575a' },
  { name: 'Ink', hex: '#33322f' },
  { name: 'Sand', hex: '#cdbda3' },
];

const ACCENTS: Colourway[] = [
  { name: 'Moss', hex: '#6b7458' },
  { name: 'Rust', hex: '#a8583a' },
  { name: 'Deep teal', hex: '#3f6169' },
  { name: 'Ochre', hex: '#b8893f' },
  { name: 'Plum', hex: '#6d4a58' },
];

const WOODS: Colourway[] = [
  { name: 'Natural oak', hex: '#c69a68', accent: '#8a6a44' },
  { name: 'Walnut', hex: '#6b4a30', accent: '#4a3222' },
  { name: 'Ash', hex: '#d6c3a5', accent: '#9c8564' },
  { name: 'Teak', hex: '#a9764a', accent: '#7b5432' },
];

const METALS: Colourway[] = [
  { name: 'Matte black', hex: '#2f2e2c', accent: '#1e1d1c' },
  { name: 'Antique brass', hex: '#a98545', accent: '#7d6231' },
  { name: 'Brushed steel', hex: '#b9bcc0', accent: '#8e9195' },
];

const GREENS: Colourway[] = [
  { name: 'Green', hex: '#4e6b45', accent: '#a9713f' },
  { name: 'Deep green', hex: '#3f5c3a', accent: '#8f8778' },
  { name: 'Silver green', hex: '#7f9a72', accent: '#c9c2b6' },
];

/**
 * How a category's products are named.
 *
 * A single template cannot serve every category. "Oatmeal Linen Eyelet
 * Curtains" reads correctly, but the same pattern gives "Natural oak Birch
 * Pegboard" — a colourway that names one wood against a material that names
 * another — and "Green in terracotta Fiddle Leaf Fig", where the material is a
 * prepositional phrase that belongs after the noun.
 */
type Naming =
  /** Colour, then material, then form: "Oatmeal Linen Eyelet Curtains". */
  | 'colour_material'
  /** Finish, then form, where the colourway already names the material:
   *  "Antique brass Wall Clock". */
  | 'finish'
  /** Form, then how it is potted: "Fiddle Leaf Fig in Terracotta". */
  | 'plant';

interface CategorySpec {
  /** Product forms, as a shopper would name them. */
  nouns: readonly string[];
  naming: Naming;
  materials: readonly { name: string; short: string; styles: StyleTag[] }[];
  colours: readonly Colourway[];
  price: readonly [number, number];
  rooms: RoomType[];
  tags: readonly string[];
  dimensions?: (random: () => number) => Dimensions;
  metadata?: (random: () => number) => Record<string, string>;
}

const LIVING: RoomType[] = ['living_room', 'home_office', 'dining_room'];
const SLEEPING: RoomType[] = ['bedroom', 'nursery'];
const ANYWHERE: RoomType[] = [
  'living_room',
  'bedroom',
  'dining_room',
  'home_office',
  'hallway',
  'nursery',
];

const FABRIC = [
  { name: 'Washed linen', short: 'Linen', styles: ['minimal', 'japandi', 'rustic'] as StyleTag[] },
  { name: 'Cotton velvet', short: 'Velvet', styles: ['traditional', 'eclectic', 'mid_century'] as StyleTag[] },
  { name: 'Brushed cotton', short: 'Cotton', styles: ['scandinavian', 'coastal', 'contemporary'] as StyleTag[] },
  { name: 'Textured weave', short: 'Weave', styles: ['contemporary', 'minimal', 'industrial'] as StyleTag[] },
];

const PLANT_CARE = [
  { light: 'bright', water: 'Weekly', petSafe: 'No - toxic to cats and dogs' },
  { light: 'low', water: 'Fortnightly', petSafe: 'Yes' },
  { light: 'indirect', water: 'Weekly', petSafe: 'Yes' },
  { light: 'low', water: 'Sparingly', petSafe: 'No - mildly toxic if chewed' },
];

const SPECS: Record<ProductCategory, CategorySpec> = {
  curtains: {
    nouns: ['Eyelet Curtains', 'Pencil Pleat Curtains', 'Blackout Curtains', 'Tab Top Curtains', 'Sheer Panels'],
    naming: 'colour_material',
    materials: FABRIC,
    colours: [...NEUTRALS, ...ACCENTS],
    price: [14_000, 85_000],
    rooms: ANYWHERE,
    tags: ['machine washable', 'thermal lined', 'made to measure'],
    dimensions: (r) => ({ width: pick([117, 145, 168, 228], r), height: pick([137, 183, 229], r) }),
  },
  blinds: {
    nouns: ['Roller Blind', 'Roman Blind', 'Venetian Blind', 'Day and Night Blind'],
    naming: 'finish',
    materials: [
      { name: 'Basswood', short: 'Wood', styles: ['mid_century', 'traditional'] },
      { name: 'Linen blend', short: 'Linen', styles: ['scandinavian', 'coastal'] },
      { name: 'Blackout PVC', short: 'Blackout', styles: ['contemporary', 'minimal'] },
    ],
    colours: [...NEUTRALS, ...WOODS],
    price: [12_000, 70_000],
    rooms: [...LIVING, 'kitchen', 'bathroom', 'bedroom'],
    tags: ['privacy', 'cut to size', 'chain operated'],
    dimensions: (r) => ({ width: pick([60, 90, 120, 150], r), height: pick([140, 160, 180], r) }),
  },
  curtain_rods: {
    nouns: ['Curtain Pole', 'Extendable Rod', 'Ceiling Track'],
    naming: 'finish',
    materials: [
      { name: 'Solid brass', short: 'Brass', styles: ['traditional', 'mid_century'] },
      { name: 'Powder-coated steel', short: 'Steel', styles: ['industrial', 'minimal'] },
      { name: 'Oak', short: 'Oak', styles: ['rustic', 'scandinavian'] },
    ],
    colours: [...METALS, ...WOODS],
    price: [8_000, 42_000],
    rooms: ANYWHERE,
    tags: ['brackets included', 'extendable'],
    dimensions: (r) => ({ width: pick([120, 180, 240, 300], r), diameter: 2.8 }),
  },
  wall_art: {
    nouns: ['Framed Print', 'Abstract Study', 'Line Drawing', 'Gallery Print', 'Botanical Print'],
    naming: 'finish',
    materials: [
      { name: 'Giclée print, oak frame', short: 'Oak framed', styles: ['minimal', 'japandi'] },
      { name: 'Matte print, ash frame', short: 'Ash framed', styles: ['contemporary', 'scandinavian'] },
      { name: 'Cotton rag print, walnut frame', short: 'Walnut framed', styles: ['mid_century', 'eclectic'] },
    ],
    colours: [...NEUTRALS, ...ACCENTS],
    price: [9_000, 60_000],
    rooms: ANYWHERE,
    tags: ['ready to hang', 'gallery wall'],
    dimensions: (r) => ({ width: pick([30, 40, 50, 60], r), height: pick([40, 50, 70, 80], r) }),
  },
  mirrors: {
    nouns: ['Arched Mirror', 'Round Mirror', 'Full Length Mirror', 'Bevelled Mirror'],
    naming: 'finish',
    materials: [
      { name: 'Solid oak, bevelled glass', short: 'Oak', styles: ['scandinavian', 'japandi'] },
      { name: 'Powder-coated steel', short: 'Steel', styles: ['industrial', 'minimal'] },
      { name: 'Brass frame', short: 'Brass', styles: ['mid_century', 'traditional'] },
    ],
    colours: [...WOODS, ...METALS],
    price: [22_000, 140_000],
    rooms: ANYWHERE,
    tags: ['bounces light', 'wall mounted'],
    dimensions: (r) => ({ width: pick([50, 60, 70], r), height: pick([70, 90, 120], r), depth: 3 }),
  },
  shelving: {
    nouns: ['Floating Shelf', 'Wall Shelf Set', 'Bracket Shelf', 'Picture Ledge'],
    naming: 'finish',
    materials: [
      { name: 'Solid oak', short: 'Oak', styles: ['scandinavian', 'minimal', 'rustic'] },
      { name: 'Painted MDF', short: 'Painted', styles: ['contemporary', 'coastal'] },
      { name: 'Steel and pine', short: 'Steel and pine', styles: ['industrial', 'eclectic'] },
    ],
    colours: [...WOODS, ...NEUTRALS],
    price: [10_000, 62_000],
    rooms: ANYWHERE,
    tags: ['concealed fixings', 'set of three'],
    dimensions: (r) => ({ width: pick([60, 80, 100], r), height: 4, depth: 20 }),
  },
  rugs: {
    nouns: ['Area Rug', 'Runner', 'Round Rug', 'Flatweave Rug', 'Shaggy Rug'],
    naming: 'colour_material',
    materials: [
      { name: 'Wool', short: 'Wool', styles: ['scandinavian', 'minimal', 'rustic'] },
      { name: 'Jute', short: 'Jute', styles: ['coastal', 'rustic'] },
      { name: 'Recycled polyester', short: 'Low pile', styles: ['contemporary', 'industrial'] },
      { name: 'Cotton flatweave', short: 'Cotton', styles: ['eclectic', 'coastal'] },
    ],
    colours: [...NEUTRALS, ...ACCENTS],
    price: [28_000, 260_000],
    rooms: [...LIVING, ...SLEEPING],
    tags: ['hard wearing', 'natural fibre', 'underfloor heating safe'],
    dimensions: (r) => ({ width: pick([140, 160, 200, 240], r), height: pick([100, 120, 170], r) }),
  },
  floor_lamps: {
    nouns: ['Floor Lamp', 'Arc Lamp', 'Tripod Lamp', 'Reading Lamp'],
    naming: 'finish',
    materials: [
      { name: 'Brushed brass, linen shade', short: 'Brass', styles: ['mid_century', 'eclectic'] },
      { name: 'Steel, cotton shade', short: 'Steel', styles: ['industrial', 'minimal'] },
      { name: 'Oak, paper shade', short: 'Oak', styles: ['scandinavian', 'japandi'] },
    ],
    colours: [...METALS, ...WOODS],
    price: [26_000, 130_000],
    rooms: LIVING,
    tags: ['dimmable', 'foot switch', 'reading light'],
    dimensions: (r) => ({ height: pick([140, 150, 160, 175], r), diameter: pick([28, 34, 40], r) }),
  },
  table_lamps: {
    nouns: ['Table Lamp', 'Bedside Lamp', 'Desk Lamp', 'Accent Lamp'],
    naming: 'finish',
    materials: [
      { name: 'Glazed ceramic, linen shade', short: 'Ceramic', styles: ['japandi', 'coastal'] },
      { name: 'Brass and glass', short: 'Brass', styles: ['mid_century', 'traditional'] },
      { name: 'Matte steel', short: 'Steel', styles: ['minimal', 'industrial'] },
    ],
    colours: [...NEUTRALS, ...METALS],
    price: [12_000, 70_000],
    rooms: ANYWHERE,
    tags: ['warm light', 'bedside', 'USB port'],
    dimensions: (r) => ({ height: pick([38, 45, 52], r), diameter: pick([20, 25, 30], r) }),
  },
  pendant_lights: {
    nouns: ['Pendant Shade', 'Dome Pendant', 'Woven Pendant', 'Cluster Pendant'],
    naming: 'finish',
    materials: [
      { name: 'Rattan', short: 'Rattan', styles: ['coastal', 'rustic'] },
      { name: 'Painted metal', short: 'Metal', styles: ['contemporary', 'industrial'] },
      { name: 'Paper', short: 'Paper', styles: ['japandi', 'minimal'] },
    ],
    colours: [...NEUTRALS, ...METALS],
    price: [15_000, 96_000],
    rooms: [...LIVING, ...SLEEPING, 'kitchen'],
    tags: ['diffuse light', 'ceiling fitting'],
    dimensions: (r) => ({ diameter: pick([35, 45, 55], r), height: pick([28, 35, 42], r) }),
  },
  plants: {
    nouns: ['Fiddle Leaf Fig', 'Kentia Palm', 'Rubber Plant', 'Bird of Paradise', 'Snake Plant', 'Dracaena'],
    naming: 'plant',
    materials: [
      { name: 'Live plant, terracotta pot', short: 'in Terracotta', styles: ['rustic', 'eclectic'] },
      { name: 'Live plant, stone pot', short: 'in Stoneware', styles: ['japandi', 'minimal'] },
      { name: 'Live plant, woven basket', short: 'in a Woven Basket', styles: ['coastal', 'scandinavian'] },
    ],
    colours: GREENS,
    price: [14_000, 78_000],
    rooms: ANYWHERE,
    tags: ['pot included', 'air purifying'],
    dimensions: (r) => ({ height: pick([90, 110, 140, 170], r), diameter: pick([20, 24, 30], r) }),
    metadata: (r) => pick(PLANT_CARE, r) as unknown as Record<string, string>,
  },
  planters: {
    nouns: ['Floor Planter', 'Plant Pot', 'Footed Planter'],
    naming: 'finish',
    materials: [
      { name: 'Glazed stoneware', short: 'Stoneware', styles: ['japandi', 'minimal'] },
      { name: 'Terracotta', short: 'Terracotta', styles: ['rustic', 'eclectic'] },
      { name: 'Fibre clay', short: 'Fibre clay', styles: ['contemporary', 'coastal'] },
    ],
    colours: [...NEUTRALS, ...ACCENTS],
    price: [7_000, 48_000],
    rooms: ANYWHERE,
    tags: ['drainage hole', 'indoor'],
    dimensions: (r) => ({ height: pick([24, 32, 40], r), diameter: pick([22, 28, 34], r) }),
  },
  cushions: {
    nouns: ['Cushion Cover', 'Bouclé Cushion', 'Lumbar Cushion', 'Piped Cushion'],
    naming: 'colour_material',
    materials: FABRIC,
    colours: [...NEUTRALS, ...ACCENTS],
    price: [4_500, 32_000],
    rooms: [...LIVING, ...SLEEPING],
    tags: ['feather filled', 'removable cover', 'machine washable'],
    dimensions: (r) => ({ width: pick([40, 45, 50, 60], r), height: pick([40, 45, 50], r) }),
  },
  throws: {
    nouns: ['Throw', 'Knitted Blanket', 'Fringed Throw', 'Waffle Throw'],
    naming: 'colour_material',
    materials: [
      { name: 'Lambswool', short: 'Lambswool', styles: ['scandinavian', 'traditional'] },
      { name: 'Cotton', short: 'Cotton', styles: ['coastal', 'minimal'] },
      { name: 'Recycled wool blend', short: 'Wool blend', styles: ['contemporary', 'rustic'] },
    ],
    colours: [...NEUTRALS, ...ACCENTS],
    price: [9_000, 62_000],
    rooms: [...LIVING, ...SLEEPING],
    tags: ['fringed', 'warm', 'sofa throw'],
    dimensions: (r) => ({ width: pick([120, 130, 150], r), height: pick([170, 180, 200], r) }),
  },
  side_tables: {
    nouns: ['Side Table', 'Nest of Tables', 'Pedestal Table', 'C-Table'],
    naming: 'finish',
    materials: [
      { name: 'Solid oak', short: 'Oak', styles: ['mid_century', 'scandinavian'] },
      { name: 'Marble and steel', short: 'Marble', styles: ['contemporary', 'minimal'] },
      { name: 'Mango wood', short: 'Mango wood', styles: ['rustic', 'eclectic'] },
    ],
    colours: [...WOODS, ...NEUTRALS],
    price: [22_000, 145_000],
    rooms: LIVING,
    tags: ['solid wood', 'assembly required'],
    dimensions: (r) => ({ height: pick([45, 50, 55], r), diameter: pick([40, 45, 50], r) }),
  },
  media_console: {
    nouns: ['Media Console', 'TV Stand', 'Low Sideboard'],
    naming: 'finish',
    materials: [
      { name: 'Walnut veneer', short: 'Walnut', styles: ['mid_century', 'contemporary'] },
      { name: 'Oak and steel', short: 'Oak', styles: ['industrial', 'scandinavian'] },
      { name: 'Painted MDF', short: 'Painted', styles: ['minimal', 'coastal'] },
    ],
    colours: [...WOODS, ...NEUTRALS],
    price: [95_000, 420_000],
    rooms: ['living_room'],
    tags: ['cable management', 'soft close'],
    dimensions: (r) => ({ width: pick([120, 150, 180], r), height: 48, depth: 40 }),
  },
  bedding: {
    nouns: ['Duvet Cover Set', 'Bedding Bundle', 'Quilted Coverlet'],
    naming: 'colour_material',
    materials: [
      { name: 'French flax linen', short: 'Linen', styles: ['rustic', 'japandi'] },
      { name: 'Brushed cotton', short: 'Cotton', styles: ['coastal', 'scandinavian'] },
      { name: 'Percale cotton', short: 'Percale', styles: ['minimal', 'contemporary'] },
    ],
    colours: [...NEUTRALS, ...ACCENTS],
    price: [22_000, 130_000],
    rooms: SLEEPING,
    tags: ['stonewashed', 'breathable', 'easy care'],
    dimensions: (r) => ({ width: pick([200, 225, 260], r), height: pick([200, 220], r) }),
  },
  headboards: {
    nouns: ['Upholstered Headboard', 'Slatted Headboard', 'Wall Panel Headboard'],
    naming: 'colour_material',
    materials: FABRIC,
    colours: [...NEUTRALS, ...ACCENTS],
    price: [48_000, 220_000],
    rooms: ['bedroom'],
    tags: ['wall mounted', 'padded'],
    dimensions: (r) => ({ width: pick([140, 160, 180], r), height: pick([100, 120], r) }),
  },
  baskets: {
    nouns: ['Storage Basket', 'Laundry Basket', 'Lidded Basket', 'Plant Basket'],
    naming: 'colour_material',
    materials: [
      { name: 'Woven seagrass', short: 'Seagrass', styles: ['coastal', 'rustic'] },
      { name: 'Cotton rope', short: 'Rope', styles: ['scandinavian', 'minimal'] },
      { name: 'Water hyacinth', short: 'Hyacinth', styles: ['eclectic', 'rustic'] },
    ],
    colours: NEUTRALS,
    price: [5_000, 34_000],
    rooms: ANYWHERE,
    tags: ['handles', 'collapsible'],
    dimensions: (r) => ({ height: pick([30, 38, 45], r), diameter: pick([32, 40, 48], r) }),
  },
  vases: {
    nouns: ['Vase', 'Stem Vase', 'Fluted Vase', 'Wide Vase'],
    naming: 'colour_material',
    materials: [
      { name: 'Stoneware', short: 'Stoneware', styles: ['japandi', 'rustic'] },
      { name: 'Recycled glass', short: 'Glass', styles: ['coastal', 'minimal'] },
      { name: 'Matte ceramic', short: 'Ceramic', styles: ['contemporary', 'minimal'] },
    ],
    colours: [...NEUTRALS, ...ACCENTS],
    price: [4_000, 38_000],
    rooms: ANYWHERE,
    tags: ['watertight', 'dried stems'],
    dimensions: (r) => ({ height: pick([22, 30, 38], r), diameter: pick([10, 14, 18], r) }),
  },
  pegboards: {
    nouns: ['Pegboard Organiser', 'Pegboard Panel', 'Modular Pegboard'],
    naming: 'finish',
    materials: [
      { name: 'Birch ply', short: 'Birch', styles: ['scandinavian', 'minimal'] },
      { name: 'Powder-coated steel', short: 'Steel', styles: ['industrial', 'contemporary'] },
      { name: 'Oak veneer', short: 'Oak', styles: ['japandi', 'minimal'] },
    ],
    colours: [...WOODS, ...NEUTRALS, ...METALS],
    price: [14_000, 68_000],
    rooms: ['home_office', 'kitchen', 'bedroom'],
    tags: ['hooks included', 'desk organisation', 'modular'],
    dimensions: (r) => ({ width: pick([45, 60, 80], r), height: pick([40, 44, 55], r), depth: 2 }),
  },
  noticeboards: {
    nouns: ['Notice Board', 'Pinboard', 'Memo Board', 'Framed Cork Board'],
    naming: 'finish',
    materials: [
      { name: 'Natural cork, pine frame', short: 'Cork', styles: ['minimal', 'rustic'] },
      { name: 'Linen over cork', short: 'Linen', styles: ['japandi', 'contemporary'] },
      { name: 'Felt panel', short: 'Felt', styles: ['scandinavian', 'contemporary'] },
    ],
    colours: [...NEUTRALS, ...WOODS],
    price: [8_000, 42_000],
    rooms: ['home_office', 'kitchen', 'nursery', 'hallway'],
    tags: ['pins included', 'self healing', 'framed'],
    dimensions: (r) => ({ width: pick([45, 60, 70], r), height: pick([35, 45, 50], r), depth: 2 }),
  },
  wall_clocks: {
    nouns: ['Wall Clock', 'Silent Clock', 'Station Clock', 'Minimal Clock'],
    naming: 'finish',
    materials: [
      { name: 'Steel and glass', short: 'Steel', styles: ['minimal', 'contemporary'] },
      { name: 'Brass and glass', short: 'Brass', styles: ['mid_century', 'traditional'] },
      { name: 'Oak and glass', short: 'Oak', styles: ['scandinavian', 'japandi'] },
    ],
    colours: [...NEUTRALS, ...METALS, ...WOODS],
    price: [6_000, 52_000],
    rooms: ['living_room', 'kitchen', 'home_office', 'hallway', 'bedroom'],
    tags: ['silent movement', 'no ticking'],
    dimensions: (r) => ({ diameter: pick([25, 30, 36, 40], r), depth: 4 }),
  },
  hanging_plants: {
    nouns: ['Trailing Pothos', 'String of Hearts', 'Spider Plant', 'English Ivy', 'Boston Fern'],
    naming: 'plant',
    materials: [
      { name: 'Live plant, cotton hanger', short: 'in a Macrame Hanger', styles: ['eclectic', 'coastal'] },
      { name: 'Live plant, ceramic pot', short: 'in a Hanging Pot', styles: ['minimal', 'japandi'] },
    ],
    colours: GREENS,
    price: [8_000, 42_000],
    rooms: ['living_room', 'bedroom', 'home_office', 'bathroom', 'hallway'],
    tags: ['trailing', 'hanger included', 'drought tolerant'],
    dimensions: (r) => ({ height: pick([40, 55, 70], r), diameter: pick([12, 16, 20], r) }),
    metadata: (r) => pick(PLANT_CARE, r) as unknown as Record<string, string>,
  },
  floor_cushions: {
    nouns: ['Floor Pouffe', 'Floor Cushion', 'Ottoman Pouffe', 'Meditation Cushion'],
    naming: 'colour_material',
    materials: [
      { name: 'Cotton and jute', short: 'Woven', styles: ['rustic', 'coastal'] },
      { name: 'Cotton velvet', short: 'Velvet', styles: ['mid_century', 'eclectic'] },
      { name: 'Bouclé', short: 'Bouclé', styles: ['contemporary', 'minimal'] },
    ],
    colours: [...NEUTRALS, ...ACCENTS],
    price: [12_000, 78_000],
    rooms: [...LIVING, ...SLEEPING],
    tags: ['extra seating', 'footrest', 'removable cover'],
    dimensions: (r) => ({ height: pick([20, 30, 38], r), diameter: pick([45, 50, 60], r) }),
  },
};

function composeName(
  naming: Naming,
  colour: string,
  material: string,
  noun: string,
  size: Dimensions | undefined,
): string {
  switch (naming) {
    case 'plant': {
      // A plant's colourway says nothing useful — every pothos is green — so
      // height does the distinguishing, which is also how they are sold.
      const height = size?.height;
      return height ? `${noun} ${material}, ${height}cm` : `${noun} ${material}`;
    }
    case 'finish':
      return `${colour} ${noun}`;
    case 'colour_material':
      return `${colour} ${material} ${noun}`;
  }
}

const RETAILER_IDS = ['ret_northfold', 'ret_marlow', 'ret_kestrel'] as const;

const AVAILABILITY: Availability[] = [
  'in_stock',
  'in_stock',
  'in_stock',
  'in_stock',
  'low_stock',
  'made_to_order',
];

/**
 * Fills every category up to `TARGET_PER_CATEGORY`, counting whatever is
 * already curated by hand.
 *
 * Combinations are walked rather than sampled — noun advances fastest, then
 * material, then colourway — so a category of twenty never repeats itself,
 * which random selection over a small vocabulary certainly would.
 */
export function generateDrafts(
  curated: readonly ProductDraft[],
  target = TARGET_PER_CATEGORY,
): ProductDraft[] {
  const generated: ProductDraft[] = [];

  for (const [category, spec] of Object.entries(SPECS) as [ProductCategory, CategorySpec][]) {
    const existing = curated.filter((draft) => draft.category === category).length;
    const used = new Set(
      curated.filter((draft) => draft.category === category).map((draft) => draft.name),
    );

    for (let i = existing; i < target; i += 1) {
      const random = rng(`${category}:${i}`);

      // Walk the grid rather than sampling it: the form advances fastest, and
      // material and colourway advance together on each pass through the forms.
      // That makes every (form, colourway) pair unique for as long as there are
      // colourways to spend, which is what stops a category of twenty from
      // listing the same thing twice under a different price.
      const block = Math.floor(i / spec.nouns.length);
      const noun = spec.nouns[i % spec.nouns.length]!;
      const material = spec.materials[block % spec.materials.length]!;
      const colour = spec.colours[block % spec.colours.length]!;

      const tags = [...spec.tags]
        .sort(() => random() - 0.5)
        .slice(0, 2 + Math.floor(random() * 2));

      const dimensions = spec.dimensions?.(random);

      let name = composeName(spec.naming, colour.name, material.short, noun, dimensions);
      // A backstop only: the grid walk above already keeps names apart. Each
      // fallback adds a word the name does not already carry.
      for (const extra of [colour.name, material.short, `No. ${block + 1}`]) {
        if (!used.has(name)) break;
        if (!name.includes(extra)) name = `${name}, ${extra}`;
      }
      used.add(name);

      generated.push({
        id: `p_gen_${category}_${i}`,
        name,
        category,
        retailerId: RETAILER_IDS[i % RETAILER_IDS.length]!,
        price: priceIn(spec.price, random),
        color: colour.name,
        colorHex: colour.hex,
        ...(colour.accent ? { accentHex: colour.accent } : {}),
        material: material.name,
        styles: material.styles,
        ...(dimensions ? { dimensions } : {}),
        rooms: spec.rooms,
        tags,
        availability: pick(AVAILABILITY, random),
        rating: {
          average: Number((3.9 + random() * 1.05).toFixed(1)),
          count: 40 + Math.floor(random() * 900),
        },
        ...(spec.metadata ? { metadata: spec.metadata(random) } : {}),
      });
    }
  }

  return generated;
}

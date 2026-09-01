import type { Product, ProductCategory, StyleTag } from '@/types/domain';
import { productRepository } from './repository';

/**
 * Editorial collections.
 *
 * Discovery is a point of view, not a catalogue dump. Each collection here is a
 * short argument about a room — "one thing for an empty corner" — and its
 * members are selected by a predicate over the catalogue rather than a hand-kept
 * list of ids, so a collection stays coherent as the catalogue grows or is
 * replaced by a live feed.
 */

export interface Collection {
  id: string;
  title: string;
  /** One line. Editorial voice, not marketing copy. */
  standfirst: string;
  /** Selects members from whatever catalogue is connected. */
  matches: (product: Product) => boolean;
}

const hasStyle =
  (...styles: StyleTag[]) =>
  (product: Product) =>
    product.styles.some((style) => styles.includes(style));

const inCategory =
  (...categories: ProductCategory[]) =>
  (product: Product) =>
    categories.includes(product.category);

export const COLLECTIONS: Collection[] = [
  {
    id: 'col_quiet_materials',
    title: 'Quiet materials',
    standfirst:
      'Linen, oak and unglazed stone. Rooms that get calmer the longer you sit in them.',
    matches: (product) =>
      hasStyle('japandi', 'minimal', 'scandinavian')(product) &&
      /linen|oak|stone|wool|ceramic|rattan|seagrass|jute/i.test(product.material),
  },
  {
    id: 'col_soften_hard_room',
    title: 'For a room that echoes',
    standfirst:
      'Hard floors and bare glass make a space sound as cold as it looks. These are the fixes, in order of effect.',
    matches: inCategory('curtains', 'rugs', 'throws', 'cushions'),
  },
  {
    id: 'col_empty_corner',
    title: 'One thing for an empty corner',
    standfirst:
      'Corners rarely need furniture. They need one object with height.',
    matches: inCategory('floor_lamps', 'plants', 'planters'),
  },
  {
    id: 'col_light_after_dark',
    title: 'Light after dark',
    standfirst:
      'A ceiling light alone flattens a room. Two more sources at eye level change the evening.',
    matches: inCategory('floor_lamps', 'table_lamps', 'pendant_lights'),
  },
  {
    id: 'col_warm_worked_in',
    title: 'Warm and worked-in',
    standfirst: 'Clay, brass and wool — colour that looks like it has been there a while.',
    matches: hasStyle('rustic', 'eclectic', 'mid_century', 'traditional'),
  },
];

export interface ResolvedCollection extends Collection {
  products: Product[];
}

/** Smaller than this and a collection reads as an accident rather than a curation. */
const MIN_MEMBERS = 3;

export async function resolveCollections(): Promise<ResolvedCollection[]> {
  const all = await productRepository.all();
  return COLLECTIONS.map((collection) => ({
    ...collection,
    products: all.filter(collection.matches),
  })).filter((collection) => collection.products.length >= MIN_MEMBERS);
}

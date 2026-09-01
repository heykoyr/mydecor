import type { Product, ProductCategory, RoomType } from '@/types/domain';
import { CATALOG_IS_REFERENCE, PRODUCTS, renderArtworkAtAspect } from './catalog';

/**
 * The catalogue boundary.
 *
 * Everything above this line — recommendations, product cards, the preview —
 * consumes `ProductRepository` and knows nothing about where products come
 * from. A live retailer feed is a second implementation of this interface plus
 * a change to the exported singleton; no screen changes.
 *
 * `isReference` is part of the contract rather than an internal detail, because
 * the UI has to tell the user when items are not purchasable. Hiding that would
 * make the product dishonest by omission.
 */

export interface ProductQuery {
  categories?: ProductCategory[];
  roomType?: RoomType;
  maxPrice?: number;
}

export interface ProductRepository {
  /** True when the catalogue is illustrative rather than purchasable. */
  readonly isReference: boolean;
  find(query: ProductQuery): Promise<Product[]>;
  byId(id: string): Promise<Product | null>;
  byIds(ids: string[]): Promise<Product[]>;
  all(): Promise<Product[]>;
  /**
   * Artwork laid out for a target aspect ratio.
   *
   * Products that are cut to a surface look wrong when a fixed image is
   * stretched to fit it. A source that can render to order honours the request;
   * one that serves fixed photography returns its usual image, and the caller
   * gets correct behaviour either way.
   */
  artworkFor(product: Product, aspectRatio: number): string;
}

class StaticProductRepository implements ProductRepository {
  readonly isReference = CATALOG_IS_REFERENCE;

  private readonly index = new Map(PRODUCTS.map((product) => [product.id, product]));

  async find({ categories, roomType, maxPrice }: ProductQuery): Promise<Product[]> {
    return PRODUCTS.filter((product) => {
      if (categories && categories.length > 0 && !categories.includes(product.category)) {
        return false;
      }
      // 'other' means we do not know the room, so it must not filter anything out.
      if (roomType && roomType !== 'other' && !product.roomCompatibility.includes(roomType)) {
        return false;
      }
      if (typeof maxPrice === 'number' && product.price > maxPrice) return false;
      return product.availability !== 'out_of_stock';
    });
  }

  async byId(id: string): Promise<Product | null> {
    return this.index.get(id) ?? null;
  }

  async byIds(ids: string[]): Promise<Product[]> {
    return ids
      .map((id) => this.index.get(id))
      .filter((product): product is Product => product !== undefined);
  }

  async all(): Promise<Product[]> {
    return PRODUCTS;
  }

  artworkFor(product: Product, aspectRatio: number): string {
    return renderArtworkAtAspect(product.id, aspectRatio) ?? product.image.src;
  }
}

const staticRepository = new StaticProductRepository();

/**
 * The repository the app actually uses.
 *
 * Delegates to a live retailer catalogue when one is connected, and to the
 * bundled reference catalogue when none is. The switch happens once, on the
 * first capability probe; until it resolves the reference catalogue answers, so
 * a screen never waits on a network round trip to render something.
 *
 * `isReference` is read by the UI to decide whether to present items as
 * purchasable, so it must track whichever repository is actually answering.
 */
class ResolvingProductRepository implements ProductRepository {
  private active: ProductRepository = staticRepository;
  private resolving: Promise<ProductRepository> | null = null;

  get isReference(): boolean {
    return this.active.isReference;
  }

  private async resolve(): Promise<ProductRepository> {
    if (typeof window === 'undefined') return staticRepository;
    this.resolving ??= (async () => {
      const { catalogCapabilities, LiveProductRepository } = await import('./live-repository');
      const { configured } = await catalogCapabilities();
      this.active = configured ? new LiveProductRepository() : staticRepository;
      return this.active;
    })();
    return this.resolving;
  }

  async find(query: ProductQuery): Promise<Product[]> {
    const repository = await this.resolve();
    try {
      const results = await repository.find(query);
      // A connected retailer that returns nothing for this spot is a worse
      // answer than the reference catalogue's, so fall back rather than show
      // an empty shelf.
      if (results.length > 0 || repository === staticRepository) return results;
    } catch {
      // Retailer unavailable; the reference catalogue keeps the app usable.
    }
    return staticRepository.find(query);
  }

  async byId(id: string): Promise<Product | null> {
    const repository = await this.resolve();
    return (await repository.byId(id)) ?? staticRepository.byId(id);
  }

  async byIds(ids: string[]): Promise<Product[]> {
    const repository = await this.resolve();
    const found = await repository.byIds(ids);
    if (found.length === ids.length) return found;
    const missing = ids.filter((id) => !found.some((product) => product.id === id));
    return [...found, ...(await staticRepository.byIds(missing))];
  }

  async all(): Promise<Product[]> {
    const repository = await this.resolve();
    const products = await repository.all();
    return products.length > 0 ? products : staticRepository.all();
  }

  artworkFor(product: Product, aspectRatio: number): string {
    return this.active.artworkFor(product, aspectRatio);
  }
}

export const productRepository: ProductRepository = new ResolvingProductRepository();


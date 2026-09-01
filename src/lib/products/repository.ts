import type { Product, ProductCategory, RoomType } from '@/types/domain';
import { CATALOG_IS_REFERENCE, PRODUCTS } from './catalog';

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
}

export const productRepository: ProductRepository = new StaticProductRepository();

/**
 * Builds the outbound link for a product, attaching affiliate attribution when
 * the retailer has a programme.
 *
 * Callers must check `productRepository.isReference` first: with the bundled
 * catalogue these URLs are placeholders and must not be presented as a way to
 * buy anything.
 */
export function buildOutboundUrl(
  productUrl: string,
  affiliateParam: string | undefined,
  affiliateTag: string | undefined,
): string {
  if (!affiliateParam || !affiliateTag) return productUrl;
  try {
    const url = new URL(productUrl);
    url.searchParams.set(affiliateParam, affiliateTag);
    return url.toString();
  } catch {
    return productUrl;
  }
}

'use client';

import type { Product, Retailer } from '@/types/domain';
import type { ProductQuery, ProductRepository } from './repository';

/**
 * The live catalogue, client side.
 *
 * Talks to `/api/catalog`, which holds the retailer credentials. Capabilities
 * are probed once per page load: with no retailer connected there is nothing to
 * ask for, and the caller falls through to the bundled reference catalogue.
 *
 * Two things a live catalogue forces that a static one does not:
 *
 * - There is no by-id endpoint. Everything this repository has seen is indexed
 *   in memory so a product can be reopened within a session; across sessions,
 *   saved products are resolved from the snapshot stored alongside them, which
 *   is the right behaviour anyway — listings are withdrawn and prices move.
 * - Artwork is photography, not something we can re-render, so `artworkFor`
 *   returns the listing image unchanged and the compositor keys its background.
 */

export interface CatalogCapabilities {
  configured: boolean;
  retailers: Retailer[];
}

let probe: Promise<CatalogCapabilities> | null = null;

export function catalogCapabilities(): Promise<CatalogCapabilities> {
  probe ??= fetch('/api/catalog')
    .then((response) => (response.ok ? response.json() : { configured: false, retailers: [] }))
    .then((payload: Partial<CatalogCapabilities>) => ({
      configured: payload.configured === true,
      retailers: Array.isArray(payload.retailers) ? payload.retailers : [],
    }))
    .catch(() => ({ configured: false, retailers: [] }));
  return probe;
}

export class LiveProductRepository implements ProductRepository {
  readonly isReference = false;

  private readonly index = new Map<string, Product>();

  private remember(products: Product[]): Product[] {
    for (const product of products) this.index.set(product.id, product);
    return products;
  }

  async find(query: ProductQuery): Promise<Product[]> {
    const response = await fetch('/api/catalog', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        categories: query.categories ?? [],
        roomType: query.roomType,
        maxPrice: query.maxPrice,
      }),
    });

    if (!response.ok) throw new Error(`Catalogue search failed (${response.status}).`);

    const payload = (await response.json()) as { products?: Product[] };
    return this.remember(Array.isArray(payload.products) ? payload.products : []);
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
    return [...this.index.values()];
  }

  artworkFor(product: Product): string {
    return product.image.src;
  }
}

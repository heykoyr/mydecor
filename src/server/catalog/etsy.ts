import type { ProductCategory } from '@/types/domain';
import { normalise, SourceError, type ProductSource, type SourceQuery } from './source';

/**
 * Etsy, via the Open API v3.
 *
 * Chosen as the first live adapter because a read-only key is issued
 * immediately and the catalogue is a good fit for the product — rugs, prints,
 * cushions, curtains — with photography good enough to composite.
 *
 * Configure with `ETSY_API_KEY`.
 *
 * Images take a second request. `findAllListingsActive` does not accept the
 * `includes` parameter — asking it for images is a 400 — so listing ids from
 * the search are fetched in one batch from `getListingsByListingIds`, which
 * does. Two calls per search, not one per listing.
 */

const SEARCH_URL = 'https://openapi.etsy.com/v3/application/listings/active';
const BATCH_URL = 'https://openapi.etsy.com/v3/application/listings/batch';

interface EtsyPrice {
  amount?: number;
  divisor?: number;
  currency_code?: string;
}

interface EtsyListing {
  listing_id?: number;
  title?: string;
  url?: string;
  price?: EtsyPrice;
  tags?: string[];
  materials?: string[];
  quantity?: number;
  images?: { url_570xN?: string; url_fullxfull?: string }[];
}

/** Etsy prices are integers plus a divisor, e.g. 2499 / 100. */
function toAmount(price: EtsyPrice | undefined): number | null {
  if (!price || typeof price.amount !== 'number') return null;
  const divisor = typeof price.divisor === 'number' && price.divisor > 0 ? price.divisor : 100;
  return Number((price.amount / divisor).toFixed(2));
}

export class EtsySource implements ProductSource {
  readonly id = 'etsy';
  readonly name = 'Etsy';
  readonly shortName = 'Etsy';
  readonly shipsTo = ['NG', 'GB', 'US', 'IE', 'CA', 'AU', 'DE', 'FR'];

  isConfigured(): boolean {
    return Boolean(process.env.ETSY_API_KEY);
  }

  private async call(url: URL, signal: AbortSignal | undefined): Promise<unknown> {
    const apiKey = process.env.ETSY_API_KEY;
    if (!apiKey) throw new SourceError(this.id, 'Etsy is not configured.', false);

    let response: Response;
    try {
      response = await fetch(url, { signal, headers: { 'x-api-key': apiKey } });
    } catch {
      throw new SourceError(this.id, 'Could not reach Etsy.', true);
    }

    if (!response.ok) {
      // Etsy explains 400s in the body; carrying that through is the difference
      // between a debuggable failure and a silent empty shelf.
      const detail = await response.text().catch(() => '');
      throw new SourceError(
        this.id,
        `Etsy ${response.status} on ${url.pathname}: ${detail.slice(0, 180)}`,
        response.status === 429 || response.status >= 500,
      );
    }

    return response.json();
  }

  async search({ keywords, category, limit, maxPrice, signal }: SourceQuery) {
    const url = new URL(SEARCH_URL);
    url.searchParams.set('keywords', keywords);
    url.searchParams.set('limit', String(Math.min(limit, 24)));
    url.searchParams.set('sort_on', 'score');
    if (typeof maxPrice === 'number' && maxPrice > 0) {
      // Etsy rejects a max without a min.
      url.searchParams.set('min_price', '1');
      url.searchParams.set('max_price', String(Math.round(maxPrice)));
    }

    const found = (await this.call(url, signal)) as { results?: EtsyListing[] };
    const listings = (found.results ?? []).filter((listing) => listing.listing_id);
    if (listings.length === 0) return [];

    const withImages = await this.attachImages(listings, signal);
    return withImages.flatMap((listing) => this.toProduct(listing, category) ?? []);
  }

  /** One batch request for every listing's images. */
  private async attachImages(
    listings: EtsyListing[],
    signal: AbortSignal | undefined,
  ): Promise<EtsyListing[]> {
    const ids = listings.map((listing) => listing.listing_id).filter(Boolean);
    const url = new URL(BATCH_URL);
    url.searchParams.set('listing_ids', ids.join(','));
    url.searchParams.set('includes', 'Images');

    try {
      const batch = (await this.call(url, signal)) as { results?: EtsyListing[] };
      const images = new Map(
        (batch.results ?? []).map((listing) => [listing.listing_id, listing.images]),
      );
      return listings.map((listing) => ({
        ...listing,
        images: images.get(listing.listing_id) ?? listing.images,
      }));
    } catch {
      // No images means nothing survives `toProduct`, which is the correct
      // outcome — a product with no picture is useless here — but it must not
      // take down the whole search with an exception.
      return listings;
    }
  }

  /** Drops anything missing a price, an image or a link rather than guessing. */
  private toProduct(listing: EtsyListing, category: ProductCategory) {
    const amount = toAmount(listing.price);
    const image = listing.images?.[0]?.url_570xN ?? listing.images?.[0]?.url_fullxfull;

    if (!listing.listing_id || !listing.title || !listing.url || !image || amount === null) {
      return null;
    }

    return normalise({
      sourceId: this.id,
      externalId: String(listing.listing_id),
      title: listing.title,
      price: amount,
      currency: listing.price?.currency_code ?? 'USD',
      imageUrl: image,
      productUrl: listing.url,
      category,
      availability:
        typeof listing.quantity === 'number' && listing.quantity === 0
          ? 'out_of_stock'
          : 'in_stock',
      ...(listing.materials?.[0] ? { material: listing.materials[0] } : {}),
      ...(listing.tags ? { tags: listing.tags } : {}),
    });
  }
}

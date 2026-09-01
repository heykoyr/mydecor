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
 */

const ENDPOINT = 'https://openapi.etsy.com/v3/application/listings/active';

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
  readonly shipsTo = ['GB', 'US', 'NG', 'IE', 'CA', 'AU', 'DE', 'FR'];

  isConfigured(): boolean {
    return Boolean(process.env.ETSY_API_KEY);
  }

  async search({ keywords, category, limit, maxPrice, signal }: SourceQuery) {
    const apiKey = process.env.ETSY_API_KEY;
    if (!apiKey) throw new SourceError(this.id, 'Etsy is not configured.', false);

    const url = new URL(ENDPOINT);
    url.searchParams.set('keywords', keywords);
    url.searchParams.set('limit', String(Math.min(limit, 24)));
    url.searchParams.set('sort_on', 'score');
    // Asks Etsy to inline listing images; without it each listing needs its own
    // request, which would turn one search into twenty-five.
    url.searchParams.set('includes', 'Images');
    if (typeof maxPrice === 'number') url.searchParams.set('max_price', String(maxPrice));

    let response: Response;
    try {
      response = await fetch(url, { signal, headers: { 'x-api-key': apiKey } });
    } catch {
      throw new SourceError(this.id, 'Could not reach Etsy.', true);
    }

    if (!response.ok) {
      throw new SourceError(
        this.id,
        `Etsy returned ${response.status}.`,
        response.status === 429 || response.status >= 500,
      );
    }

    const payload = (await response.json()) as { results?: EtsyListing[] };
    return (payload.results ?? []).flatMap((listing) => this.toProduct(listing, category) ?? []);
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

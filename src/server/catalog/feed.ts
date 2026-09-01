import type { ProductCategory } from '@/types/domain';
import { normalise, SourceError, type ProductSource, type SourceQuery } from './source';

/**
 * A retailer reached through an affiliate product feed rather than a public API.
 *
 * This is the honest route for Amazon, Temu, Jumia and Konga: none of them
 * publishes a product-search API that a third-party app can call. What they do
 * publish, to approved affiliates, is a product feed — and affiliate networks
 * (Awin, Rakuten, Admitad, Skimlinks) serve those feeds as JSON over HTTP.
 *
 * Rather than one adapter per retailer, this adapter is configured with a field
 * mapping, so any JSON feed can be consumed without new code. Configure with
 * `PRODUCT_FEEDS`, a JSON array:
 *
 * [{
 *   "id": "jumia",
 *   "name": "Jumia Nigeria",
 *   "shortName": "Jumia",
 *   "url": "https://feed.example/products?q={query}&limit={limit}",
 *   "shipsTo": ["NG"],
 *   "headers": { "Authorization": "Bearer ..." },
 *   "itemsPath": "data.products",
 *   "map": {
 *     "externalId": "sku",
 *     "title": "name",
 *     "price": "price.value",
 *     "currency": "price.currency",
 *     "image": "images.0.url",
 *     "link": "product_url"
 *   }
 * }]
 *
 * `{query}` and `{limit}` in the URL are substituted per search.
 */

interface FeedMapping {
  externalId: string;
  title: string;
  price: string;
  currency?: string;
  image: string;
  link: string;
  material?: string;
  availability?: string;
}

export interface FeedConfig {
  id: string;
  name: string;
  shortName?: string;
  url: string;
  shipsTo?: string[];
  headers?: Record<string, string>;
  /** Dot path to the array of items. Omit when the body is the array itself. */
  itemsPath?: string;
  /** Fallback when the feed does not carry a currency per item. */
  currency?: string;
  map: FeedMapping;
}

/** Reads `a.b.0.c` out of an arbitrary JSON body. */
function at(source: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((value, key) => {
    if (value === null || typeof value !== 'object') return undefined;
    return (value as Record<string, unknown>)[key];
  }, source);
}

function asString(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (typeof value === 'number') return String(value);
  return null;
}

/** Feeds quote prices as numbers, as "12.99", and as "₦12,999.00". */
function asPrice(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string') return null;
  const cleaned = value.replace(/[^0-9.,]/g, '').replace(/,(?=\d{3}\b)/g, '');
  const parsed = Number.parseFloat(cleaned.replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

export function readFeedConfigs(): FeedConfig[] {
  const raw = process.env.PRODUCT_FEEDS;
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as FeedConfig[];
    return Array.isArray(parsed)
      ? parsed.filter((feed) => feed?.id && feed?.url && feed?.map?.title)
      : [];
  } catch {
    // A malformed feed configuration must not take the catalogue down; the
    // reference catalogue is still there behind it.
    return [];
  }
}

export class FeedSource implements ProductSource {
  readonly id: string;
  readonly name: string;
  readonly shortName: string;
  readonly shipsTo: string[];

  constructor(private readonly config: FeedConfig) {
    this.id = config.id;
    this.name = config.name;
    this.shortName = config.shortName ?? config.name;
    this.shipsTo = config.shipsTo ?? [];
  }

  isConfigured(): boolean {
    return Boolean(this.config.url);
  }

  async search({ keywords, category, limit, signal }: SourceQuery) {
    const url = this.config.url
      .replace('{query}', encodeURIComponent(keywords))
      .replace('{limit}', String(limit));

    let response: Response;
    try {
      response = await fetch(url, { signal, headers: this.config.headers ?? {} });
    } catch {
      throw new SourceError(this.id, `Could not reach ${this.name}.`, true);
    }

    if (!response.ok) {
      throw new SourceError(
        this.id,
        `${this.name} returned ${response.status}.`,
        response.status === 429 || response.status >= 500,
      );
    }

    const body = (await response.json()) as unknown;
    const items = this.config.itemsPath ? at(body, this.config.itemsPath) : body;
    if (!Array.isArray(items)) {
      throw new SourceError(this.id, `${this.name} returned an unexpected shape.`, false);
    }

    return items.slice(0, limit).flatMap((item) => this.toProduct(item, category) ?? []);
  }

  private toProduct(item: unknown, category: ProductCategory) {
    const { map } = this.config;
    const externalId = asString(at(item, map.externalId));
    const title = asString(at(item, map.title));
    const imageUrl = asString(at(item, map.image));
    const productUrl = asString(at(item, map.link));
    const price = asPrice(at(item, map.price));

    if (!externalId || !title || !imageUrl || !productUrl || price === null) return null;

    const currency =
      (map.currency ? asString(at(item, map.currency)) : null) ?? this.config.currency ?? 'USD';
    const material = map.material ? asString(at(item, map.material)) : null;

    return normalise({
      sourceId: this.id,
      externalId,
      title,
      price,
      currency,
      imageUrl,
      productUrl,
      category,
      ...(material ? { material } : {}),
    });
  }
}

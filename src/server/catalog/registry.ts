import type { Product, ProductCategory, Retailer, RoomType } from '@/types/domain';
import { CATEGORY_KEYWORDS, type ProductSource } from './source';
import { EtsySource } from './etsy';
import { FeedSource, readFeedConfigs } from './feed';

/**
 * The live catalogue.
 *
 * Federates every configured retailer into one ranked-elsewhere list. Sources
 * are queried in parallel and failures are isolated: one retailer being down
 * costs its own results, never the whole search.
 *
 * With nothing configured the registry is empty, `/api/catalog` says so, and
 * the client keeps using the bundled reference catalogue. That is the only
 * reason the app has a reference catalogue at all.
 */

/** Per-source timeout. A slow retailer must not hold up the others. */
const SOURCE_TIMEOUT_MS = 6000;

export function activeSources(): ProductSource[] {
  const sources: ProductSource[] = [
    new EtsySource(),
    ...readFeedConfigs().map((config) => new FeedSource(config)),
  ];
  return sources.filter((source) => source.isConfigured());
}

export function retailersFor(sources: ProductSource[]): Retailer[] {
  const affiliateTag = process.env.AFFILIATE_TAG;
  return sources.map((source) => ({
    id: source.id,
    name: source.name,
    shortName: source.shortName,
    affiliateProgram: Boolean(affiliateTag),
    ...(affiliateTag ? { affiliateParam: 'tag' } : {}),
    shipsTo: source.shipsTo,
  }));
}

export interface CatalogQuery {
  categories: ProductCategory[];
  roomType?: RoomType;
  maxPrice?: number;
  /** Per category, per source. */
  limit?: number;
  signal?: AbortSignal;
}

export interface SourceFailure {
  source: string;
  /**
   * Why it failed, in the adapter's own words.
   *
   * Carries upstream status codes and messages but never credentials — a
   * retailer integration that fails silently is one nobody can fix.
   */
  message: string;
}

export interface CatalogResult {
  products: Product[];
  /** Sources that failed, so the UI can be honest about partial results. */
  failed: SourceFailure[];
}

async function withTimeout<T>(work: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SOURCE_TIMEOUT_MS);
  try {
    return await work(controller.signal);
  } finally {
    clearTimeout(timer);
  }
}

export async function searchCatalog({
  categories,
  roomType,
  maxPrice,
  limit = 8,
}: CatalogQuery): Promise<CatalogResult> {
  const sources = activeSources();
  if (sources.length === 0) return { products: [], failed: [] };

  const jobs = sources.flatMap((source) =>
    categories.map(async (category) => {
      try {
        const products = await withTimeout((signal) =>
          source.search({
            keywords: CATEGORY_KEYWORDS[category],
            category,
            limit,
            ...(roomType ? { roomType } : {}),
            ...(typeof maxPrice === 'number' ? { maxPrice } : {}),
            signal,
          }),
        );
        return { products, failure: null as SourceFailure | null };
      } catch (cause) {
        return {
          products: [] as Product[],
          failure: {
            source: source.id,
            message: cause instanceof Error ? cause.message : 'Unknown failure.',
          },
        };
      }
    }),
  );

  const settled = await Promise.all(jobs);

  const seen = new Set<string>();
  const products: Product[] = [];
  for (const outcome of settled) {
    for (const product of outcome.products) {
      if (seen.has(product.id)) continue;
      seen.add(product.id);
      products.push(product);
    }
  }

  const failed: SourceFailure[] = [];
  for (const outcome of settled) {
    if (outcome.failure && !failed.some((f) => f.source === outcome.failure!.source)) {
      failed.push(outcome.failure);
    }
  }

  return { products, failed };
}

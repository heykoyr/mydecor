'use client';

import type { Retailer } from '@/types/domain';
import { RETAILERS } from './catalog';
import { catalogCapabilities } from './live-repository';

/**
 * Who a product is sold by.
 *
 * Retailers arrive from two places: the reference catalogue ships its own, and
 * connected sources describe themselves through `/api/catalog`. Screens need one
 * lookup covering both, or a live product shows "sold by undefined" while the
 * reference catalogue looks fine.
 *
 * The live set is folded in once the capability probe resolves. Until then the
 * static set answers, which is correct because that is also the catalogue
 * answering.
 */

const registry = new Map<string, Retailer>(RETAILERS.map((retailer) => [retailer.id, retailer]));

let hydrated = false;

/** Folds connected retailers into the registry. Safe to call repeatedly. */
export async function hydrateRetailers(): Promise<void> {
  if (hydrated) return;
  hydrated = true;
  const { retailers } = await catalogCapabilities().catch(() => ({ retailers: [] as Retailer[] }));
  for (const retailer of retailers) registry.set(retailer.id, retailer);
}

export function lookupRetailer(id: string): Retailer | undefined {
  return registry.get(id);
}

/**
 * The outbound link for a product, with affiliate attribution where the
 * retailer has a programme and this deployment has a tag.
 *
 * Attribution is per retailer: each programme names its own parameter, so a tag
 * is only appended to the retailer it belongs to.
 */
export function outboundUrl(productUrl: string, retailerId: string): string {
  const retailer = lookupRetailer(retailerId);
  const tag = process.env.NEXT_PUBLIC_AFFILIATE_TAG;

  if (!retailer?.affiliateProgram || !retailer.affiliateParam || !tag) return productUrl;

  try {
    const url = new URL(productUrl);
    url.searchParams.set(retailer.affiliateParam, tag);
    return url.toString();
  } catch {
    return productUrl;
  }
}

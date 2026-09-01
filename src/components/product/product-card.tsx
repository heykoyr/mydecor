'use client';

import type { Product, Recommendation } from '@/types/domain';
import { cn, formatPrice } from '@/lib/utils';
import { lookupRetailer } from '@/lib/products/retailers';
import { Skeleton } from '@/components/ui/surfaces';

/**
 * A product in a rail.
 *
 * The artwork is transparent, so it needs a surface to sit on; that surface is
 * the same neutral used everywhere else rather than a per-product tint, which
 * would turn a row of cards into a row of competing colours.
 *
 * Availability is shown only when it is not `in_stock` — a badge on every card
 * reading "in stock" is noise that trains people to stop reading badges.
 */
export function ProductCard({
  recommendation,
  onSelect,
  className,
}: {
  recommendation: Recommendation;
  onSelect: (product: Product) => void;
  className?: string;
}) {
  const { product } = recommendation;
  const retailer = lookupRetailer(product.retailerId);

  return (
    <button
      type="button"
      onClick={() => onSelect(product)}
      className={cn(
        'group w-[9.5rem] shrink-0 text-left sm:w-[10.5rem]',
        'rounded-lg focus-visible:shadow-focus',
        className,
      )}
    >
      <div className="relative aspect-square w-full overflow-hidden rounded-lg bg-sunken">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={product.image.src}
          alt={product.image.alt}
          className="absolute inset-[14%] h-[72%] w-[72%] object-contain transition-transform duration-slow ease-out group-hover:scale-[1.04]"
          loading="lazy"
          decoding="async"
        />
        {product.availability !== 'in_stock' && (
          <span className="absolute left-2 top-2 rounded-sm bg-bg/90 px-1.5 py-1 text-label uppercase text-muted backdrop-blur-sm">
            {product.availability === 'low_stock' ? 'Low stock' : 'To order'}
          </span>
        )}
      </div>

      {/* Two lines reserved, so prices align across a rail. */}
      <h3 className="mt-2.5 line-clamp-2 min-h-[2.6em] text-body-sm font-medium leading-snug text-ink">
        {product.name}
      </h3>
      <p className="mt-1 text-body-sm text-ink">{formatPrice(product.price, product.currency)}</p>
      {retailer && <p className="mt-0.5 text-caption text-faint">{retailer.shortName}</p>}
    </button>
  );
}

export function ProductCardSkeleton() {
  return (
    <div className="w-[9.5rem] shrink-0 sm:w-[10.5rem]">
      <Skeleton className="aspect-square w-full rounded-lg" />
      <Skeleton className="mt-2.5 h-3.5 w-full" />
      <Skeleton className="mt-1.5 h-3.5 w-1/2" />
    </div>
  );
}

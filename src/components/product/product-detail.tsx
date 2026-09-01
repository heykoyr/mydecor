'use client';

import type { Product } from '@/types/domain';
import { formatDimensions, formatPrice, humanise } from '@/lib/utils';
import { getRetailer } from '@/lib/products/catalog';
import { productRepository } from '@/lib/products/repository';
import { Badge } from '@/components/ui/surfaces';

/**
 * Product detail, rendered inside the room sheet.
 *
 * Ordered so the product stays connected to the room it was suggested for:
 * the image, then why it was suggested *here*, then the specifics. A
 * conventional commerce layout would lead with price and specification, which
 * is the right order when someone is comparing products and the wrong one when
 * they are deciding whether something suits a wall they are looking at.
 */
export function ProductDetail({
  product,
  reason,
}: {
  product: Product;
  /** Why this was suggested here. Absent when browsing rather than recommended. */
  reason?: string;
}) {
  const retailer = getRetailer(product.retailerId);
  const dimensions = product.dimensions ? formatDimensions(product.dimensions) : null;

  const attributes = [
    ['Material', product.material],
    ['Colour', product.color],
    ...(dimensions ? [['Size', dimensions]] : []),
    ...(retailer ? [['Sold by', retailer.name]] : []),
    [
      'Availability',
      product.availability === 'in_stock'
        ? 'In stock'
        : humanise(product.availability.replace(/_/g, ' ')),
    ],
  ] as const;

  return (
    <div>
      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-lg bg-sunken">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={product.image.src}
          alt={product.image.alt}
          className="absolute inset-[10%] h-[80%] w-[80%] object-contain"
        />
      </div>

      {/* The name is already the sheet's heading; repeating it here would be
          the same words twice within 40 pixels. */}
      <div className="mt-5 flex items-baseline gap-3">
        <span className="text-h3 font-semibold text-ink">
          {formatPrice(product.price, product.currency)}
        </span>
        {product.rating && (
          <span className="text-body-sm text-muted">
            {product.rating.average.toFixed(1)} ({product.rating.count.toLocaleString('en-GB')}{' '}
            reviews)
          </span>
        )}
      </div>

      {/* The recommendation's own justification, in the user's terms. */}
      {reason && (
        <p className="mt-5 border-l-2 border-accent pl-4 text-body text-muted">{reason}</p>
      )}

      <dl className="mt-6 divide-y divide-line border-y border-line">
        {attributes.map(([label, value]) => (
          <div key={label} className="flex items-baseline justify-between gap-6 py-2.5">
            <dt className="shrink-0 text-body-sm text-faint">{label}</dt>
            <dd className="text-right text-body-sm text-ink">{value}</dd>
          </div>
        ))}
      </dl>

      {productRepository.isReference && (
        <div className="mt-5 rounded-md bg-sunken px-4 py-3">
          <Badge tone="caution">Sample catalogue</Badge>
          <p className="mt-2 text-body-sm text-muted">
            This item comes from the bundled reference catalogue, so it is not purchasable and the
            retailer is not a real one. Everything else on this screen — the recommendation, the
            in-room preview — works exactly as it will with a live catalogue connected.
          </p>
        </div>
      )}
    </div>
  );
}

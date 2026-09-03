'use client';

import { useEffect, useState } from 'react';
import type { Product } from '@/types/domain';
import { formatDimensions, formatPrice, humanise } from '@/lib/utils';
import { hydrateRetailers, lookupRetailer, outboundUrl } from '@/lib/products/retailers';
import { track } from '@/lib/analytics/analytics';
import { Badge } from '@/components/ui/surfaces';
import { ExternalIcon } from '@/components/ui/icons';

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
  // Connected retailers describe themselves over the network, so the registry
  // needs a chance to fill in before this renders their name.
  const [, setHydrated] = useState(0);
  useEffect(() => {
    void hydrateRetailers().then(() => setHydrated((n) => n + 1));
  }, []);

  const retailer = lookupRetailer(product.retailerId);
  const dimensions = product.dimensions ? formatDimensions(product.dimensions) : null;
  // Only a real listing gets a buy link. With a reference item there is nothing
  // to link to, and a button that goes nowhere is worse than no button.
  //
  // Compared against `false` rather than negated: a product snapshot saved
  // before this field existed carries no provenance at all, and an item whose
  // origin is unknown must not be presented as purchasable. Unknown fails
  // closed, towards the honest answer.
  const purchasable = product.isReference === false;
  const retailerName = retailer?.name ?? 'the retailer';

  const care = product.metadata ?? {};

  const attributes = [
    ['Material', product.material],
    ['Colour', product.color],
    // Care requirements matter more than specification for anything living.
    ...(care.light ? [['Light', `${care.light[0]!.toUpperCase()}${care.light.slice(1)}`]] : []),
    ...(care.water ? [['Water', care.water]] : []),
    ...(care.petSafe ? [['Pet safe', care.petSafe]] : []),
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

      {purchasable && (
        <a
          href={outboundUrl(product.url, product.retailerId)}
          target="_blank"
          rel="noopener noreferrer nofollow sponsored"
          onClick={() =>
            track('shop_clicked', {
              productId: product.id,
              retailerId: product.retailerId,
              price: product.price,
            })
          }
          className="mt-6 flex h-13 w-full items-center justify-center gap-2 rounded-lg border border-line bg-surface text-body font-medium text-ink transition-colors hover:bg-sunken"
        >
          Buy at {retailerName}
          <ExternalIcon size={17} />
        </a>
      )}

      {!purchasable && (
        <div className="mt-5 rounded-md bg-sunken px-4 py-3">
          <Badge tone="caution">Sample catalogue</Badge>
          {/*
            Describes the item, not the deployment. A retailer can be connected
            and still fail its search, in which case this reference item is
            being served as a fallback — and saying "no retailer is connected"
            would then be false in exactly the situation the notice matters most.
          */}
          <p className="mt-2 text-body-sm text-muted">
            This item comes from the bundled reference catalogue: it is not purchasable and the
            seller is not a real one. Everything else here — the recommendation, the in-room
            preview — behaves exactly as it will with a real listing.
          </p>
        </div>
      )}
    </div>
  );
}

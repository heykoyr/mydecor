'use client';

import { useEffect, useMemo, useState } from 'react';
import type {
  Opportunity,
  Product,
  ProductCategory,
  Recommendation,
  RoomAnalysis,
  UserPreferences,
} from '@/types/domain';
import { humanise } from '@/lib/utils';
import { recommendForOpportunity } from '@/lib/products/recommendations';
import { productRepository } from '@/lib/products/repository';
import { track } from '@/lib/analytics/analytics';
import { Sheet } from '@/components/ui/sheet';
import { Button, IconButton } from '@/components/ui/button';
import { Chip } from '@/components/ui/surfaces';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { BookmarkIcon, PreviewIcon } from '@/components/ui/icons';
import { ProductCard, ProductCardSkeleton } from '@/components/product/product-card';
import { ProductDetail } from '@/components/product/product-detail';

/**
 * The sheet that opens from a hotspot.
 *
 * It navigates within itself — opportunity, then product — rather than
 * stacking a second modal. Two dialogs deep is where focus management and
 * back-button behaviour start to go wrong, and on a phone the second sheet
 * would cover the room the product is being judged against.
 */

type View = { name: 'opportunity' } | { name: 'product'; recommendation: Recommendation };

type Load =
  | { status: 'loading' }
  | { status: 'ready'; recommendations: Recommendation[] }
  | { status: 'error' };

export function RoomSheet({
  opportunity,
  analysis,
  preferences,
  savedIds,
  onToggleSave,
  onPreview,
  onClose,
}: {
  opportunity: Opportunity | null;
  analysis: RoomAnalysis;
  preferences: UserPreferences;
  savedIds: ReadonlySet<string>;
  onToggleSave: (product: Product, opportunity: Opportunity) => void;
  onPreview: (recommendation: Recommendation, opportunity: Opportunity) => void;
  onClose: () => void;
}) {
  const [load, setLoad] = useState<Load>({ status: 'loading' });
  const [view, setView] = useState<View>({ name: 'opportunity' });
  const [category, setCategory] = useState<ProductCategory | 'all'>('all');

  useEffect(() => {
    if (!opportunity) return;
    // A newly opened hotspot always starts at its own overview.
    setView({ name: 'opportunity' });
    setCategory('all');
    setLoad({ status: 'loading' });

    let active = true;
    recommendForOpportunity({ opportunity, analysis, preferences })
      .then((recommendations) => {
        if (!active) return;
        setLoad({ status: 'ready', recommendations });
        track('hotspot_selected', {
          opportunityType: opportunity.type,
          results: recommendations.length,
        });
      })
      .catch(() => active && setLoad({ status: 'error' }));

    return () => {
      active = false;
    };
  }, [opportunity, analysis, preferences]);

  const recommendations = load.status === 'ready' ? load.recommendations : [];

  const categories = useMemo(() => {
    const present = new Set(recommendations.map((item) => item.product.category));
    return opportunity?.recommendedCategories.filter((c) => present.has(c)) ?? [];
  }, [recommendations, opportunity]);

  const visible =
    category === 'all'
      ? recommendations
      : recommendations.filter((item) => item.product.category === category);

  if (!opportunity) return null;

  const isProductView = view.name === 'product';
  const product = isProductView ? view.recommendation.product : null;
  const saved = product ? savedIds.has(product.id) : false;

  return (
    <Sheet
      open
      onClose={onClose}
      title={isProductView && product ? product.name : opportunity.title}
      description={isProductView ? undefined : opportunity.rationale}
      onBack={isProductView ? () => setView({ name: 'opportunity' }) : undefined}
      footer={
        isProductView && product ? (
          <div className="flex items-center gap-3">
            <Button
              size="lg"
              fullWidth
              icon={<PreviewIcon size={19} />}
              onClick={() => onPreview(view.recommendation, opportunity)}
            >
              Preview in my room
            </Button>
            <IconButton
              label={saved ? 'Remove from saved' : 'Save this product'}
              variant="secondary"
              size="lg"
              aria-pressed={saved}
              onClick={() => onToggleSave(product, opportunity)}
              className="shrink-0"
            >
              <BookmarkIcon size={20} filled={saved} />
            </IconButton>
          </div>
        ) : undefined
      }
    >
      {isProductView ? (
        <ProductDetail product={view.recommendation.product} reason={view.recommendation.reason} />
      ) : (
        <div>
          {categories.length > 1 && (
            <div
              role="group"
              aria-label="Filter by category"
              className="rail -mx-5 mb-5 flex gap-2 overflow-x-auto px-5"
            >
              <Chip selected={category === 'all'} onClick={() => setCategory('all')}>
                All
              </Chip>
              {categories.map((item) => (
                <Chip
                  key={item}
                  selected={category === item}
                  onClick={() => setCategory(item)}
                >
                  {humanise(item)}
                </Chip>
              ))}
            </div>
          )}

          {load.status === 'loading' && (
            <div aria-busy="true" className="flex gap-4">
              <ProductCardSkeleton />
              <ProductCardSkeleton />
            </div>
          )}

          {load.status === 'error' && (
            <ErrorState
              title="We couldn't load suggestions"
              body="Something went wrong reading the catalogue. Nothing about your room was lost."
              onRetry={onClose}
              retryLabel="Close and try again"
            />
          )}

          {load.status === 'ready' && visible.length === 0 && (
            <EmptyState
              title="Nothing suitable here"
              body={
                productRepository.isReference
                  ? 'The reference catalogue has nothing that fits this spot. A live catalogue would have far more to draw on.'
                  : 'We could not find anything that suits this spot and your preferences. Widening your budget usually helps.'
              }
            />
          )}

          {load.status === 'ready' && visible.length > 0 && (
            <div className="rail -mx-5 flex gap-4 overflow-x-auto px-5 pb-2 md:mx-0 md:grid md:grid-cols-2 md:overflow-visible md:px-0">
              {visible.map((recommendation) => (
                <ProductCard
                  key={recommendation.product.id}
                  recommendation={recommendation}
                  className="md:w-full"
                  onSelect={() => {
                    setView({ name: 'product', recommendation });
                    track('product_viewed', {
                      productId: recommendation.product.id,
                      category: recommendation.product.category,
                      opportunityType: opportunity.type,
                    });
                  }}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </Sheet>
  );
}

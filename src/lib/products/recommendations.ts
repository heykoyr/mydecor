import type {
  Opportunity,
  Product,
  Recommendation,
  RecommendationFactors,
  RoomAnalysis,
  UserPreferences,
} from '@/types/domain';
import { quadHeight, quadWidth } from '@/lib/geometry';
import { clamp, humanise } from '@/lib/utils';
import { describeColor, paletteHarmony } from '@/lib/color';
import { productRepository } from './repository';

/**
 * The recommendation engine.
 *
 * Ranking is a weighted blend of seven factors, kept entirely out of the UI so
 * it can be tuned — eventually from engagement data — without touching a
 * component. The weights below are a starting position, not a result: they
 * encode a product opinion (relevance to the spot beats everything; price is a
 * filter, not a ranking signal) that engagement data should be allowed to
 * overturn.
 *
 * The scores are never shown. What the user sees is one sentence naming the
 * strongest reason, which is the only part of this that has to be legible.
 */

const WEIGHTS: RecommendationFactors = {
  categoryRelevance: 0.3,
  styleMatch: 0.18,
  paletteMatch: 0.16,
  sizeFit: 0.14,
  priceFit: 0.1,
  availability: 0.06,
  popularity: 0.06,
};

/** Below this the item is a worse suggestion than showing fewer items. */
const MIN_SCORE = 0.32;

export interface RecommendationContext {
  opportunity: Opportunity;
  analysis: RoomAnalysis;
  preferences: UserPreferences;
}

/**
 * How well the product's proportions suit the region the user tapped.
 *
 * This is an honest partial signal, not a fit calculation: the app has no
 * measurement of the room, so it compares shapes rather than sizes. A landscape
 * rug into a wide floor region scores well; a portrait one does not.
 */
function scoreSizeFit(product: Product, opportunity: Opportunity): number {
  const region = opportunity.region;
  const regionAspect = quadWidth(region) / Math.max(quadHeight(region), 1e-6);
  if (!Number.isFinite(regionAspect) || regionAspect <= 0) return 0.5;

  if (opportunity.placement === 'overlay_surface') {
    // The product should broadly match the shape of the surface it covers.
    const ratio = product.image.aspectRatio / regionAspect;
    return clamp(1 - Math.abs(Math.log2(ratio)) / 2, 0, 1);
  }

  if (opportunity.placement === 'standing') {
    // Standing objects want a region taller than it is wide to stand in.
    return clamp(1 - Math.abs(Math.log2(1 / Math.max(regionAspect, 0.05))) / 3, 0.25, 1);
  }

  // Mounted and resting items are sized by `coverage`, so shape matters less.
  return 0.7;
}

function scorePriceFit(product: Product, preferences: UserPreferences): number {
  const budget = preferences.budget;
  if (!budget) return 0.7;
  if (product.price < budget.min) return 0.85;
  if (budget.max === null || product.price <= budget.max) return 1;
  // Over budget: decays rather than excludes, so a near-miss can still appear.
  const overshoot = (product.price - budget.max) / Math.max(budget.max, 1);
  return clamp(1 - overshoot * 1.6, 0, 0.6);
}

function scorePopularity(product: Product): number {
  if (!product.rating) return 0.5;
  const quality = clamp((product.rating.average - 3.4) / 1.6, 0, 1);
  // Volume matters, but with sharply diminishing returns.
  const confidence = clamp(Math.log10(product.rating.count + 1) / 3, 0, 1);
  return quality * 0.75 + confidence * 0.25;
}

const AVAILABILITY_SCORE = {
  in_stock: 1,
  low_stock: 0.82,
  made_to_order: 0.62,
  out_of_stock: 0,
} as const;

function scoreFactors(
  product: Product,
  { opportunity, analysis, preferences }: RecommendationContext,
): RecommendationFactors {
  const categoryRank = opportunity.recommendedCategories.indexOf(product.category);
  const categoryRelevance = categoryRank === -1 ? 0 : 1 - categoryRank * 0.16;

  const preferredStyles = new Set([...analysis.styles, ...preferences.preferredStyles]);
  const styleOverlap = product.styles.filter((style) => preferredStyles.has(style)).length;
  const styleMatch =
    preferredStyles.size === 0
      ? 0.55 // Nothing known about the room's style: stay neutral, don't punish.
      : clamp(styleOverlap / Math.min(preferredStyles.size, 2), 0, 1);

  return {
    categoryRelevance: clamp(categoryRelevance, 0, 1),
    styleMatch,
    paletteMatch: paletteHarmony(
      product.colorHex,
      analysis.palette.map((entry) => entry.hex),
    ),
    sizeFit: scoreSizeFit(product, opportunity),
    priceFit: scorePriceFit(product, preferences),
    availability: AVAILABILITY_SCORE[product.availability],
    popularity: scorePopularity(product),
  };
}

function blend(factors: RecommendationFactors): number {
  return (Object.keys(WEIGHTS) as (keyof RecommendationFactors)[]).reduce(
    (total, key) => total + factors[key] * WEIGHTS[key],
    0,
  );
}

/**
 * One sentence explaining the match, chosen from whichever factor contributed
 * most above its baseline. Generic praise would be worse than saying nothing.
 */
function explain(
  product: Product,
  factors: RecommendationFactors,
  context: RecommendationContext,
): string {
  const { analysis, preferences } = context;

  if (factors.styleMatch > 0.75) {
    const shared = product.styles.find(
      (style) => analysis.styles.includes(style) || preferences.preferredStyles.includes(style),
    );
    if (shared) return `Matches the ${humanise(shared).toLowerCase()} feel already in this room.`;
  }

  if (factors.paletteMatch > 0.78) {
    const dominant = analysis.palette[0];
    if (dominant) {
      return `Its ${product.color.toLowerCase()} sits comfortably with the ${describeColor(dominant.hex)} in this room.`;
    }
  }

  if (factors.sizeFit > 0.8) {
    return 'Proportioned for the shape of the space you tapped.';
  }

  if (product.availability === 'made_to_order') {
    return 'Made to your window size, so it hangs correctly.';
  }

  if (factors.popularity > 0.8 && product.rating) {
    return `A consistent favourite — ${product.rating.average.toFixed(1)} from ${product.rating.count.toLocaleString('en-GB')} reviews.`;
  }

  return `A straightforward first move for ${context.opportunity.title.toLowerCase()}.`;
}

/**
 * Ranked products for one opportunity.
 *
 * Candidates come from the opportunity's own categories only, which is the
 * point: this returns what suits the spot, not everything the catalogue holds.
 */
export async function recommendForOpportunity(
  context: RecommendationContext,
  limit = 8,
): Promise<Recommendation[]> {
  const candidates = await productRepository.find({
    categories: context.opportunity.recommendedCategories,
    roomType: context.analysis.roomType,
  });

  const ranked = candidates
    .map((product) => {
      const factors = scoreFactors(product, context);
      return {
        product,
        factors,
        score: blend(factors),
        reason: explain(product, factors, context),
      } satisfies Recommendation;
    })
    .filter((recommendation) => recommendation.score >= MIN_SCORE)
    .sort((a, b) => b.score - a.score);

  return ranked.slice(0, limit);
}

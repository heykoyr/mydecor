'use client';

import type { Opportunity, Product, Quad, Visualization } from '@/types/domain';
import { fitInQuad, fitInQuadByHeight, quadToPixels } from '@/lib/geometry';
import { decodeImage } from '@/lib/image/prepare';
import {
  drawContactShadow,
  drawImageInQuad,
  gradeToRoom,
  sampleRegionLight,
} from './draw';

/**
 * The visualisation boundary.
 *
 * One implementation ships today: a canvas compositor that places the product's
 * artwork into the user's photograph using the opportunity's own surface quad.
 * A generative provider (inpainting against a masked region) implements the
 * same interface and reports `fidelity: 'measured'` only if it genuinely has
 * measurements — which is the field the UI reads to decide whether to caption a
 * result as indicative.
 *
 * The compositor is deliberately not trying to be photoreal. It is trying to
 * answer one question honestly: at this size, in this colour, in this spot,
 * does this work in my room?
 */

export interface VisualizationRequest {
  roomImageSrc: string;
  product: Product;
  opportunity: Opportunity;
  signal?: AbortSignal;
}

export interface VisualizationOutput {
  /** JPEG data URL of the composed room. */
  dataUrl: string;
  fidelity: Visualization['fidelity'];
}

export interface VisualizationProvider {
  readonly name: string;
  render(request: VisualizationRequest): Promise<VisualizationOutput>;
}

export class VisualizationError extends Error {
  constructor(
    message: string,
    readonly reason: 'unsupported_product' | 'decode_failed' | 'canvas_unavailable',
  ) {
    super(message);
    this.name = 'VisualizationError';
  }
}

/**
 * Where the product actually goes.
 *
 * The opportunity supplies the surface; the placement mode decides both how the
 * product sits on it and which axis its `coverage` refers to.
 *
 * Things hung on or cut to a surface are sized by its width — a mirror takes a
 * third of the wall. Things that stand on a floor or rest on furniture are
 * sized by height, because height against the surface behind them is what
 * communicates their real scale. `anchorV: 1` then seats them on the bottom
 * edge of the region, which is what makes a lamp meet the floor rather than
 * hover above it.
 */
function placementQuad(opportunity: Opportunity, product: Product): Quad {
  const { region, placement } = opportunity;
  const aspect = product.image.aspectRatio;

  switch (placement) {
    case 'overlay_surface':
      // Curtains, blinds and rugs are cut to their surface; they fill it.
      return region;
    case 'mounted':
      // Hung slightly above centre, the way art is actually hung.
      return fitInQuad(region, aspect, product.coverage, 0.5, 0.44);
    case 'standing':
    case 'resting':
      return fitInQuadByHeight(region, aspect, product.coverage, 0.5, 1);
  }
}

export class CanvasCompositeProvider implements VisualizationProvider {
  readonly name = 'canvas-composite';

  async render({
    roomImageSrc,
    product,
    opportunity,
    signal,
  }: VisualizationRequest): Promise<VisualizationOutput> {
    if (!product.supportedPlacements.includes(opportunity.placement)) {
      throw new VisualizationError(
        `${product.name} cannot be shown in this position.`,
        'unsupported_product',
      );
    }

    const [room, artwork] = await Promise.all([
      loadImage(roomImageSrc),
      loadImage(product.image.src),
    ]);
    signal?.throwIfAborted();

    const canvas = document.createElement('canvas');
    canvas.width = room.naturalWidth;
    canvas.height = room.naturalHeight;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) {
      throw new VisualizationError('This browser cannot compose images.', 'canvas_unavailable');
    }

    ctx.drawImage(room, 0, 0);

    const target = quadToPixels(
      placementQuad(opportunity, product),
      canvas.width,
      canvas.height,
    );

    // Sample the room before anything is drawn over it.
    const light = sampleRegionLight(ctx, target, canvas.width, canvas.height);

    // Objects that rest on a surface need their shadow underneath them.
    if (opportunity.placement === 'standing' || opportunity.placement === 'resting') {
      drawContactShadow(ctx, target, light.brightness);
    }

    const graded = gradeToRoom(artwork, light);
    drawImageInQuad(
      ctx,
      graded,
      target,
      artwork.naturalWidth || artwork.width,
      artwork.naturalHeight || artwork.height,
    );

    signal?.throwIfAborted();

    return {
      dataUrl: canvas.toDataURL('image/jpeg', 0.9),
      // The app has no measurement of the room, so it must never claim more.
      fidelity: 'indicative',
    };
  }
}

async function loadImage(src: string): Promise<HTMLImageElement> {
  try {
    const response = await fetch(src);
    return await decodeImage(await response.blob());
  } catch {
    throw new VisualizationError('An image could not be read.', 'decode_failed');
  }
}

export const visualizationProvider: VisualizationProvider = new CanvasCompositeProvider();

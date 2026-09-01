'use client';

import type { CapturedImage } from '@/types/domain';

/**
 * Client-side image preparation.
 *
 * Phone cameras produce 8–12 megapixel files. Nothing downstream benefits from
 * that: analysis works at 128px, compositing at display resolution, and storage
 * has a quota. So every photo is normalised once, here, at the moment of
 * capture — and the original is never retained.
 *
 * The dimensions below are the product's real constraints, not round numbers:
 * 1600px is enough to fill a desktop room canvas at 2× density, and 400px is
 * enough for a thumbnail at 2× in a two-column grid.
 */

const MAX_EDGE = 1600;
const THUMBNAIL_EDGE = 400;
const JPEG_QUALITY = 0.86;
const THUMBNAIL_QUALITY = 0.7;

/** Anything larger is a photograph library export or a mistake. */
const MAX_FILE_BYTES = 25 * 1024 * 1024;

const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];

export type PrepareFailure =
  | { code: 'unsupported_type'; message: string }
  | { code: 'too_large'; message: string }
  | { code: 'decode_failed'; message: string }
  | { code: 'canvas_unavailable'; message: string };

export class ImagePrepareError extends Error {
  constructor(readonly failure: PrepareFailure) {
    super(failure.message);
    this.name = 'ImagePrepareError';
  }
}

export function validateFile(file: File): PrepareFailure | null {
  // Some browsers report an empty type for HEIC; fall back to the extension.
  const looksLikeImage = file.type.startsWith('image/') || /\.(jpe?g|png|webp|heic|heif)$/i.test(file.name);

  if (!looksLikeImage || (file.type && !ACCEPTED_TYPES.includes(file.type))) {
    return {
      code: 'unsupported_type',
      message: 'That file is not a photo we can read. Try a JPEG, PNG or WebP.',
    };
  }

  if (file.size > MAX_FILE_BYTES) {
    return {
      code: 'too_large',
      message: 'That photo is over 25 MB. Try one taken directly on your phone or camera.',
    };
  }

  return null;
}

/** Decodes a blob, honouring EXIF orientation where the browser supports it. */
export async function decodeImage(source: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(source);
  try {
    const image = new Image();
    image.decoding = 'async';
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () =>
        reject(
          new ImagePrepareError({
            code: 'decode_failed',
            message: "We couldn't open that photo. It may be damaged or in a format we can't read.",
          }),
        );
      image.src = url;
    });
    // Force the decode before the object URL is revoked.
    if (typeof image.decode === 'function') {
      await image.decode().catch(() => undefined);
    }
    return image;
  } finally {
    // Safari needs the URL alive until after decode; revoking on the next tick
    // is late enough and still avoids leaking one URL per capture.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

function scaleToFit(width: number, height: number, maxEdge: number) {
  const longest = Math.max(width, height);
  if (longest <= maxEdge) return { width, height };
  const scale = maxEdge / longest;
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

function toCanvas(image: CanvasImageSource, width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new ImagePrepareError({
      code: 'canvas_unavailable',
      message: 'This browser will not let us process images. Try a different browser.',
    });
  }
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(image, 0, 0, width, height);
  return canvas;
}

function estimateBytes(dataUrl: string): number {
  const payload = dataUrl.slice(dataUrl.indexOf(',') + 1);
  return Math.round((payload.length * 3) / 4);
}

/**
 * Normalises a captured photo to a display-sized JPEG data URL.
 *
 * Data URLs rather than object URLs deliberately: a room outlives the page that
 * created it, and an object URL would be dead the moment the tab reloads.
 */
export async function prepareCapture(
  source: Blob,
  origin: CapturedImage['source'],
): Promise<{ image: CapturedImage; thumbnail: string; element: HTMLImageElement }> {
  const decoded = await decodeImage(source);
  const full = scaleToFit(decoded.naturalWidth, decoded.naturalHeight, MAX_EDGE);
  const canvas = toCanvas(decoded, full.width, full.height);
  const src = canvas.toDataURL('image/jpeg', JPEG_QUALITY);

  const thumb = scaleToFit(full.width, full.height, THUMBNAIL_EDGE);
  const thumbnail = toCanvas(canvas, thumb.width, thumb.height).toDataURL(
    'image/jpeg',
    THUMBNAIL_QUALITY,
  );

  // Re-decode the normalised image so downstream analysis measures exactly what
  // the user will see, not the original the canvas was drawn from.
  const element = new Image();
  element.src = src;
  await element.decode().catch(() => undefined);

  return {
    image: {
      src,
      width: full.width,
      height: full.height,
      byteSize: estimateBytes(src),
      capturedAt: new Date().toISOString(),
      source: origin,
    },
    thumbnail,
    element,
  };
}

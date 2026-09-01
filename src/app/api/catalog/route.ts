import { NextResponse } from 'next/server';
import { PRODUCT_CATEGORIES, ROOM_TYPES, type ProductCategory, type RoomType } from '@/types/domain';
import { activeSources, retailersFor, searchCatalog } from '@/server/catalog/registry';

/**
 * The live catalogue endpoint.
 *
 * Retailer credentials stay here. The client asks GET for which retailers are
 * connected before it decides whether to use the live catalogue or the bundled
 * reference one — so with nothing configured it never issues a pointless search.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Retailer results change slowly; a short shared cache spares their APIs. */
const CACHE_SECONDS = 300;

export function GET() {
  const sources = activeSources();
  return NextResponse.json(
    { configured: sources.length > 0, retailers: retailersFor(sources) },
    { headers: { 'cache-control': 'no-store' } },
  );
}

export async function POST(request: Request) {
  if (activeSources().length === 0) {
    // Not an error: the client has a working fallback and should use it.
    return NextResponse.json(
      { error: 'not_configured', message: 'No retailer is connected to this deployment.' },
      { status: 501 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'invalid_request', message: 'The request body was not valid JSON.' },
      { status: 400 },
    );
  }

  const { categories, roomType, maxPrice } = (body ?? {}) as {
    categories?: unknown;
    roomType?: unknown;
    maxPrice?: unknown;
  };

  // Only known categories reach a retailer's search box.
  const wanted = Array.isArray(categories)
    ? categories.filter((value): value is ProductCategory =>
        (PRODUCT_CATEGORIES as readonly string[]).includes(value as string),
      )
    : [];

  if (wanted.length === 0) {
    return NextResponse.json(
      { error: 'invalid_request', message: 'No known product categories were requested.' },
      { status: 400 },
    );
  }

  const room = (ROOM_TYPES as readonly string[]).includes(roomType as string)
    ? (roomType as RoomType)
    : undefined;

  try {
    const { products, failed } = await searchCatalog({
      categories: wanted.slice(0, 4),
      ...(room ? { roomType: room } : {}),
      ...(typeof maxPrice === 'number' && maxPrice > 0 ? { maxPrice } : {}),
    });

    return NextResponse.json(
      { products, failed },
      { headers: { 'cache-control': `public, s-maxage=${CACHE_SECONDS}, stale-while-revalidate=60` } },
    );
  } catch {
    return NextResponse.json(
      { error: 'upstream_unavailable', message: 'The catalogue is temporarily unavailable.' },
      { status: 503 },
    );
  }
}

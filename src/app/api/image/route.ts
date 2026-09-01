import { NextResponse } from 'next/server';

/**
 * Retailer image proxy.
 *
 * Two reasons this exists, both hard requirements rather than conveniences:
 *
 * - The compositor draws the product into a canvas and reads the result back.
 *   A cross-origin image taints the canvas and `toDataURL` throws, so retailer
 *   photography has to be served from this origin.
 * - It keeps the user's browser from making requests directly to retailer CDNs
 *   while they are browsing their own room.
 *
 * It is an allow-listed proxy, not an open one: only hosts belonging to a
 * connected retailer are fetched, so this cannot be used to launder arbitrary
 * traffic through the deployment.
 */

export const runtime = 'nodejs';

/** Hosts of the retailers this app can be configured with. */
const DEFAULT_ALLOWED = ['i.etsystatic.com', 'img.etsystatic.com'];

const MAX_BYTES = 8 * 1024 * 1024;
const CACHE_SECONDS = 86_400;

function allowedHosts(): string[] {
  const extra = (process.env.IMAGE_HOST_ALLOWLIST ?? '')
    .split(',')
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean);
  return [...DEFAULT_ALLOWED, ...extra];
}

function isAllowed(url: URL): boolean {
  if (url.protocol !== 'https:') return false;
  const host = url.hostname.toLowerCase();
  // Exact host, or a subdomain of an allowed host — never a suffix match on a
  // bare string, which `evil-i.etsystatic.com.attacker.net` would satisfy.
  return allowedHosts().some((allowed) => host === allowed || host.endsWith(`.${allowed}`));
}

export async function GET(request: Request) {
  const src = new URL(request.url).searchParams.get('src');
  if (!src) return new NextResponse('Missing src', { status: 400 });

  let target: URL;
  try {
    target = new URL(src);
  } catch {
    return new NextResponse('Invalid src', { status: 400 });
  }

  if (!isAllowed(target)) return new NextResponse('Host not allowed', { status: 403 });

  let upstream: Response;
  try {
    upstream = await fetch(target, {
      headers: { accept: 'image/*' },
      signal: request.signal,
      redirect: 'follow',
    });
  } catch {
    return new NextResponse('Upstream unavailable', { status: 502 });
  }

  const type = upstream.headers.get('content-type') ?? '';
  if (!upstream.ok || !type.startsWith('image/')) {
    return new NextResponse('Not an image', { status: 502 });
  }

  const length = Number(upstream.headers.get('content-length') ?? 0);
  if (length > MAX_BYTES) return new NextResponse('Image too large', { status: 413 });

  const body = await upstream.arrayBuffer();
  if (body.byteLength > MAX_BYTES) return new NextResponse('Image too large', { status: 413 });

  return new NextResponse(body, {
    headers: {
      'content-type': type,
      'cache-control': `public, max-age=${CACHE_SECONDS}, immutable`,
      'content-security-policy': "default-src 'none'",
      'x-content-type-options': 'nosniff',
    },
  });
}

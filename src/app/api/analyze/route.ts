import { NextResponse } from 'next/server';
import { classifyLighting, type VisionResult } from '@/lib/vision/provider';
import { analyseWithAnthropic, AnthropicVisionError } from '@/server/vision/anthropic';

/**
 * Room analysis endpoint.
 *
 * Exists so the vision provider's credentials stay on the server. The client
 * asks GET for capabilities before uploading anything — if no model is
 * configured, there is no point spending the user's bandwidth on an 800 KB
 * photograph to be told so.
 */

export const runtime = 'nodejs';
// The response depends on runtime configuration and the request body.
export const dynamic = 'force-dynamic';

/** Comfortably above a 1600px JPEG data URL, well below anything abusive. */
const MAX_BODY_BYTES = 3 * 1024 * 1024;

const RATE_LIMIT = { windowMs: 60_000, max: 12 };
const recentRequests = new Map<string, number[]>();

/**
 * Per-instance rate limiting. Enough to stop one client hammering an expensive
 * upstream; a real deployment behind more than one instance needs a shared
 * store, which is why the limit is deliberately generous rather than tight.
 */
function isRateLimited(key: string): boolean {
  const now = Date.now();
  const hits = (recentRequests.get(key) ?? []).filter((at) => now - at < RATE_LIMIT.windowMs);
  hits.push(now);
  recentRequests.set(key, hits);

  if (recentRequests.size > 5000) recentRequests.clear();
  return hits.length > RATE_LIMIT.max;
}

function providerConfig() {
  const mode = process.env.VISION_PROVIDER ?? 'auto';
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const enabled = mode !== 'heuristic' && Boolean(apiKey);
  return { enabled, apiKey, model: process.env.ANTHROPIC_VISION_MODEL };
}

/** Capability probe. Cheap, and keeps the client from uploading pointlessly. */
export function GET() {
  const { enabled } = providerConfig();
  return NextResponse.json(
    { configured: enabled, provider: enabled ? 'anthropic' : null },
    { headers: { 'cache-control': 'no-store' } },
  );
}

export async function POST(request: Request) {
  const { enabled, apiKey, model } = providerConfig();

  if (!enabled || !apiKey) {
    // Not an error: the client has a working fallback and should use it.
    return NextResponse.json(
      {
        error: 'not_configured',
        message: 'No vision provider is configured for this deployment.',
      },
      { status: 501 },
    );
  }

  const forwardedFor = request.headers.get('x-forwarded-for');
  const client = forwardedFor?.split(',')[0]?.trim() || 'local';
  if (isRateLimited(client)) {
    return NextResponse.json(
      { error: 'rate_limited', message: 'Too many scans in a short time. Try again shortly.' },
      { status: 429, headers: { 'retry-after': '60' } },
    );
  }

  let body: unknown;
  try {
    const raw = await request.text();
    if (raw.length > MAX_BODY_BYTES) {
      return NextResponse.json(
        { error: 'invalid_request', message: 'That image is too large to analyse.' },
        { status: 413 },
      );
    }
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json(
      { error: 'invalid_request', message: 'The request body was not valid JSON.' },
      { status: 400 },
    );
  }

  const { imageDataUrl, meanLuma } = (body ?? {}) as {
    imageDataUrl?: unknown;
    meanLuma?: unknown;
  };

  if (typeof imageDataUrl !== 'string' || !imageDataUrl.startsWith('data:image/')) {
    return NextResponse.json(
      { error: 'invalid_request', message: 'No image was supplied.' },
      { status: 400 },
    );
  }

  try {
    const detected = await analyseWithAnthropic(
      imageDataUrl,
      { apiKey, model },
      request.signal,
    );

    const result: VisionResult = {
      ...detected,
      lighting: classifyLighting(typeof meanLuma === 'number' ? meanLuma : 128),
    };

    return NextResponse.json(result, { headers: { 'cache-control': 'no-store' } });
  } catch (cause) {
    if (cause instanceof AnthropicVisionError) {
      return NextResponse.json(
        {
          error: cause.retryable ? 'upstream_unavailable' : 'upstream_rejected',
          message: cause.retryable
            ? 'The analysis service is busy. Trying again usually works.'
            : 'The analysis service could not read that photo.',
        },
        { status: cause.retryable ? 503 : 422 },
      );
    }

    return NextResponse.json(
      { error: 'upstream_unavailable', message: 'Analysis is temporarily unavailable.' },
      { status: 503 },
    );
  }
}

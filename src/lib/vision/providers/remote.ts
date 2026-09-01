import {
  VisionUnavailableError,
  type VisionProvider,
  type VisionRequest,
  type VisionResult,
} from '../provider';

/**
 * Client half of the model-backed provider.
 *
 * Talks to `/api/analyze`, which holds the credentials. Capabilities are probed
 * once per page load and cached: without a configured model there is no reason
 * to upload the photograph at all, and the caller falls straight through to the
 * on-device analyser.
 */

let capabilityProbe: Promise<boolean> | null = null;

export function resetCapabilityCache(): void {
  capabilityProbe = null;
}

async function isConfigured(): Promise<boolean> {
  capabilityProbe ??= fetch('/api/analyze', { method: 'GET' })
    .then((response) => (response.ok ? response.json() : { configured: false }))
    .then((payload: { configured?: boolean }) => payload.configured === true)
    .catch(() => false);
  return capabilityProbe;
}

export class RemoteVisionProvider implements VisionProvider {
  readonly name = 'remote-vision';
  readonly isHeuristic = false;

  /** Whether this deployment can use the provider at all. */
  static available = isConfigured;

  async detect({ imageDataUrl, signals, signal }: VisionRequest): Promise<VisionResult> {
    let response: Response;
    try {
      response = await fetch('/api/analyze', {
        method: 'POST',
        signal,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ imageDataUrl, meanLuma: signals.meanLuma }),
      });
    } catch {
      throw new VisionUnavailableError('Could not reach the analysis service.', 'network');
    }

    if (response.status === 501) {
      throw new VisionUnavailableError('No vision provider is configured.', 'not_configured');
    }

    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as { message?: string };
      throw new VisionUnavailableError(
        payload.message ?? 'The analysis service is unavailable.',
        response.status >= 500 || response.status === 429 ? 'network' : 'rejected',
      );
    }

    const result = (await response.json()) as VisionResult;
    if (!Array.isArray(result.objects)) {
      throw new VisionUnavailableError('The analysis service returned an unusable result.', 'malformed');
    }
    return result;
  }
}

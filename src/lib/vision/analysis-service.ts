'use client';

import type { CapturedImage, RoomAnalysis, RoomType } from '@/types/domain';
import { createId } from '@/lib/utils';
import { decodeImage } from '@/lib/image/prepare';
import { extractSignals, type ImageSignals } from './signals';
import { assessQuality } from './quality';
import { deriveOpportunities } from './opportunities';
import { VisionUnavailableError, type VisionProvider, type VisionResult } from './provider';
import { HeuristicVisionProvider } from './providers/heuristic';
import { RemoteVisionProvider } from './providers/remote';

/**
 * Room analysis orchestration.
 *
 * signals → perception → opportunities → analysis
 *
 * The provider is chosen at call time and degrades rather than failing: if a
 * model is configured but unreachable, the on-device analyser still produces a
 * usable room. A scan should never dead-end because an upstream service is
 * having a bad afternoon.
 */

export type AnalysisStage =
  | 'reading_photo'
  | 'understanding_space'
  | 'finding_opportunities'
  | 'done';

export interface AnalyseOptions {
  roomId: string;
  image: CapturedImage;
  /** Overrides the detected room type when the user has told us. */
  roomTypeOverride?: RoomType;
  onStage?: (stage: AnalysisStage) => void;
  signal?: AbortSignal;
}

async function loadElement(dataUrl: string): Promise<HTMLImageElement> {
  const response = await fetch(dataUrl);
  return decodeImage(await response.blob());
}

async function selectProvider(): Promise<VisionProvider> {
  try {
    if (await RemoteVisionProvider.available()) return new RemoteVisionProvider();
  } catch {
    // Probe failure means unconfigured as far as the user is concerned.
  }
  return new HeuristicVisionProvider();
}

export async function analyseRoom(options: AnalyseOptions): Promise<RoomAnalysis> {
  const startedAt = performance.now();
  const { roomId, image, roomTypeOverride, onStage, signal } = options;

  onStage?.('reading_photo');
  const element = await loadElement(image.src);
  const signals = extractSignals(element);

  onStage?.('understanding_space');
  const provider = await selectProvider();

  let detection: VisionResult;
  let usedProvider = provider;

  try {
    detection = await provider.detect({ imageDataUrl: image.src, signals, signal });
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === 'AbortError') throw cause;
    if (!(cause instanceof VisionUnavailableError) || provider.isHeuristic) throw cause;

    // The model was configured but did not answer. Fall back rather than fail —
    // geometry alone is still a usable room.
    usedProvider = new HeuristicVisionProvider();
    detection = await usedProvider.detect({ imageDataUrl: image.src, signals, signal });
  }

  onStage?.('finding_opportunities');
  const roomType = roomTypeOverride ?? detection.roomType;
  const opportunities = deriveOpportunities(detection.objects, {
    roomType,
    lighting: detection.lighting,
    objects: detection.objects,
  });

  const qualityIssues = assessQuality(signals);
  if (detection.objects.length === 0) qualityIssues.push('no_room_detected');

  onStage?.('done');

  return {
    id: createId('analysis'),
    roomId,
    roomType,
    roomTypeConfidence: roomTypeOverride ? 1 : detection.roomTypeConfidence,
    styles: detection.styles,
    palette: signals.palette,
    lighting: detection.lighting,
    detectedObjects: detection.objects,
    opportunities,
    qualityIssues,
    provider: usedProvider.name,
    isHeuristic: usedProvider.isHeuristic,
    analysedAt: new Date().toISOString(),
    durationMs: Math.round(performance.now() - startedAt),
  };
}

/**
 * Re-derives opportunities after the user names the room.
 *
 * Perception does not change — only the rules that depend on room type — so
 * this is instant and never re-runs the provider.
 */
export function withRoomType(analysis: RoomAnalysis, roomType: RoomType): RoomAnalysis {
  return {
    ...analysis,
    roomType,
    roomTypeConfidence: 1,
    opportunities: deriveOpportunities(analysis.detectedObjects, {
      roomType,
      lighting: analysis.lighting,
      objects: analysis.detectedObjects,
    }),
  };
}

export type { ImageSignals };

import type { DetectedObject, RoomAnalysis, RoomType, StyleTag } from '@/types/domain';
import type { ImageSignals } from './signals';

/**
 * The vision boundary.
 *
 * A provider answers exactly one question: what is in this photograph, and
 * where. It does not decide what the user should buy, or what a space needs —
 * that is the opportunity engine's job, and keeping the two apart is what lets
 * the model behind this interface be replaced without changing a single
 * recommendation.
 *
 * Providers return `DetectedObject`s with normalised geometry. Anything a
 * provider cannot determine is omitted rather than guessed, and
 * `isHeuristic` tells the UI whether to describe the result as a full read of
 * the room or as surfaces only.
 */

export interface VisionRequest {
  /** JPEG data URL of the normalised capture. */
  imageDataUrl: string;
  /** Locally computed measurements. Cheap for providers to use, free to ignore. */
  signals: ImageSignals;
  /** Aborts an in-flight remote call when the user leaves. */
  signal?: AbortSignal;
}

export interface VisionResult {
  roomType: RoomType;
  roomTypeConfidence: number;
  styles: StyleTag[];
  lighting: RoomAnalysis['lighting'];
  objects: DetectedObject[];
}

export interface VisionProvider {
  /** Recorded on the analysis for debugging and provider comparison. */
  readonly name: string;
  /**
   * True when the provider infers geometry without recognising objects. The UI
   * must not present heuristic output as though furniture was identified.
   */
  readonly isHeuristic: boolean;
  detect(request: VisionRequest): Promise<VisionResult>;
}

export class VisionUnavailableError extends Error {
  constructor(
    message: string,
    readonly reason: 'not_configured' | 'network' | 'rejected' | 'malformed',
  ) {
    super(message);
    this.name = 'VisionUnavailableError';
  }
}

/** Shared lighting classification, so providers describe exposure identically. */
export function classifyLighting(meanLuma: number): RoomAnalysis['lighting'] {
  if (meanLuma >= 165) return 'bright';
  if (meanLuma >= 105) return 'natural';
  if (meanLuma >= 62) return 'artificial';
  return 'dim';
}

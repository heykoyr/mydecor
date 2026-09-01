import type { AnalysisQualityIssue } from '@/types/domain';
import type { ImageSignals } from './signals';

/**
 * Photo quality assessment.
 *
 * Run before analysis, so a photo that cannot produce a good result is caught
 * while the user is still standing in the room and can simply take another one.
 * Telling someone their photo was too dark after they have walked away is worse
 * than useless.
 *
 * These are warnings, never blocks. The user can always proceed — the thresholds
 * are heuristics, and being wrong about someone's deliberately moody living room
 * should cost them a dismissed notice, not their scan.
 */

const THRESHOLDS = {
  /** Mean luminance, 0–255. Below this, surfaces stop separating from shadow. */
  dark: 48,
  /** Above this, highlights are clipped and window regions merge with walls. */
  bright: 216,
  /** Normalised focus measure; below this, edges are too soft to place against. */
  blurry: 0.13,
  /** Total pixels. Under this, a downscaled analysis has nothing to work with. */
  resolution: 480 * 360,
  /** Fraction of frame filled by one bright region — a close-up, not a room. */
  closeUp: 0.62,
} as const;

export function assessQuality(signals: ImageSignals): AnalysisQualityIssue[] {
  const issues: AnalysisQualityIssue[] = [];

  if (signals.meanLuma < THRESHOLDS.dark) issues.push('too_dark');
  else if (signals.meanLuma > THRESHOLDS.bright) issues.push('too_bright');

  if (signals.sharpness < THRESHOLDS.blurry) issues.push('blurry');
  if (signals.width * signals.height < THRESHOLDS.resolution) issues.push('low_resolution');

  // A single region covering most of the frame means the camera is against a
  // surface rather than looking into a space.
  const largest = signals.brightRegions[0];
  if (largest && largest.width * largest.height > THRESHOLDS.closeUp) issues.push('too_close');

  return issues;
}

/** Issues serious enough to interrupt the user before analysis. */
const BLOCKING: readonly AnalysisQualityIssue[] = ['too_dark', 'blurry', 'low_resolution'];

export function isWorthWarningAbout(issue: AnalysisQualityIssue): boolean {
  return BLOCKING.includes(issue);
}

/** User-facing copy. Each says what is wrong and what to do about it. */
export function describeIssue(issue: AnalysisQualityIssue): { title: string; body: string } {
  switch (issue) {
    case 'too_dark':
      return {
        title: 'This photo is quite dark',
        body: 'We may miss surfaces in the shadows. Turning on a light usually fixes it.',
      };
    case 'too_bright':
      return {
        title: 'This photo is very bright',
        body: 'Blown-out windows are hard to read. Try again without shooting into the light.',
      };
    case 'blurry':
      return {
        title: 'This photo looks soft',
        body: 'Edges are blurred, so placements may not line up. Hold still and try once more.',
      };
    case 'too_close':
      return {
        title: 'This is very close in',
        body: 'Step back so we can see the walls and floor meet — that is how we judge scale.',
      };
    case 'low_resolution':
      return {
        title: 'This photo is small',
        body: 'There is not much detail to work with. A photo straight from your camera works best.',
      };
    case 'no_room_detected':
      return {
        title: "This doesn't look like a room",
        body: 'We could not find walls or a floor. Try a wider shot of the space itself.',
      };
  }
}

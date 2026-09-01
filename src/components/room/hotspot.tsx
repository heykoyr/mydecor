'use client';

import { motion } from 'framer-motion';
import type { Opportunity } from '@/types/domain';
import { cn } from '@/lib/utils';

/**
 * A hotspot.
 *
 * The visible mark is 14px; the touch target is 44px of transparent padding
 * around it. Anchoring is by the mark's centre, so the dot sits exactly on the
 * point the analysis identified rather than near it.
 *
 * Legibility against unknown photography is the whole problem here: a white dot
 * disappears on a white wall and a dark one disappears on a dark floor. The
 * solution is a light core with a dark translucent ring and an outer shadow, so
 * one of the three always separates from the background.
 */

export function Hotspot({
  opportunity,
  index,
  selected,
  onSelect,
}: {
  opportunity: Opportunity;
  /** Drives the entrance stagger, in priority order. */
  index: number;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <motion.button
      type="button"
      onClick={onSelect}
      aria-label={`${opportunity.title}. ${opportunity.rationale}`}
      aria-pressed={selected}
      className="group absolute grid h-11 w-11 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full"
      style={{ left: `${opportunity.anchor.x * 100}%`, top: `${opportunity.anchor.y * 100}%` }}
      initial={{ opacity: 0, scale: 0.4 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{
        // Hotspots arrive in priority order, so the eye lands on the strongest
        // idea first rather than on whichever is nearest the top-left.
        delay: 0.12 + index * 0.09,
        type: 'spring',
        stiffness: 480,
        damping: 26,
      }}
    >
      {/* Halo. Present only on the unselected state, where it aids discovery. */}
      {!selected && (
        <span
          aria-hidden="true"
          className="absolute h-6 w-6 animate-breathe rounded-full bg-white/25 blur-[2px]"
        />
      )}

      <span
        aria-hidden="true"
        className={cn(
          'relative rounded-full ring-1 ring-black/25 transition-all duration-base ease-out',
          'shadow-[0_1px_6px_rgb(0_0_0/0.45)]',
          selected
            ? 'h-5 w-5 bg-white ring-2 ring-black/40'
            : 'h-3.5 w-3.5 bg-white/95 group-hover:h-[18px] group-hover:w-[18px]',
        )}
      >
        {selected && (
          <span className="absolute inset-[5px] rounded-full bg-black/85" />
        )}
      </span>
    </motion.button>
  );
}

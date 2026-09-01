import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** A plain content surface. Elevation is a border, not a shadow. */
export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('rounded-lg border border-line bg-surface', className)}
      {...props}
    />
  );
}

/**
 * A selectable filter token. Chips are for switching between sets of content —
 * never as a substitute for a button that performs an action.
 */
export function Chip({
  selected = false,
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { selected?: boolean }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={selected}
      className={cn(
        'inline-flex h-9 shrink-0 items-center rounded-full px-4 text-body-sm font-medium',
        'transition-colors duration-fast ease-out',
        selected
          ? 'bg-ink text-inverse'
          : 'border border-line bg-surface text-muted hover:border-line-strong hover:text-ink',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

/**
 * A small, non-interactive status marker. Used sparingly — availability,
 * heuristic-analysis notices, and nothing decorative.
 */
export function Badge({
  tone = 'neutral',
  className,
  children,
}: {
  tone?: 'neutral' | 'positive' | 'caution' | 'accent';
  className?: string;
  children: ReactNode;
}) {
  const tones = {
    neutral: 'bg-sunken text-muted',
    positive: 'bg-success/10 text-success',
    caution: 'bg-warning/12 text-warning',
    accent: 'bg-accent-soft text-accent',
  } as const;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-sm px-2 py-1 text-label uppercase',
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/**
 * Loading placeholder.
 *
 * Skeletons must match the shape of what replaces them, or the transition
 * reads as a layout bug rather than a load.
 */
export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden="true"
      className={cn('relative overflow-hidden rounded-md bg-sunken', className)}
      {...props}
    >
      <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-ink/[0.045] to-transparent" />
    </div>
  );
}

/**
 * A fixed-ratio image frame.
 *
 * Reserving the box before the image decodes is what keeps an image-led product
 * from shifting under the reader's thumb.
 */
export function ImageFrame({
  ratio = 1,
  rounded = 'lg',
  className,
  children,
}: {
  ratio?: number;
  rounded?: 'md' | 'lg' | 'xl' | 'none';
  className?: string;
  children: ReactNode;
}) {
  const radii = { md: 'rounded-md', lg: 'rounded-lg', xl: 'rounded-xl', none: '' } as const;
  return (
    <div
      className={cn('relative w-full overflow-hidden bg-sunken', radii[rounded], className)}
      style={{ aspectRatio: ratio }}
    >
      {children}
    </div>
  );
}

/** A section heading with an optional trailing action. */
export function SectionHeader({
  title,
  action,
  className,
}: {
  title: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex items-baseline justify-between gap-4', className)}>
      <h2 className="font-sans text-h3 font-semibold text-ink">{title}</h2>
      {action}
    </div>
  );
}

import Link from 'next/link';
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Buttons.
 *
 * Five variants, three sizes, one implementation. `Button` renders a `<button>`
 * or, when given `href`, a link with identical styling — so navigation actions
 * stay real links (middle-clickable, keyboard-navigable, crawlable) without a
 * second component drifting out of sync.
 */

type Variant = 'primary' | 'secondary' | 'ghost' | 'overlay' | 'danger';
type Size = 'sm' | 'md' | 'lg';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-ink text-inverse hover:bg-ink/90 active:bg-ink/80',
  secondary: 'bg-surface text-ink border border-line hover:bg-sunken active:bg-sunken',
  ghost: 'text-ink hover:bg-sunken active:bg-sunken',
  // For controls sitting directly on photography, where surfaces must not
  // introduce a competing colour but still need to stay legible.
  overlay:
    'bg-white/92 text-black backdrop-blur-md hover:bg-white active:bg-white/85 shadow-e1 dark:bg-black/60 dark:text-white dark:hover:bg-black/75',
  danger: 'bg-danger text-white hover:bg-danger/90 active:bg-danger/80',
};

const SIZES: Record<Size, string> = {
  // 36px. Dense, secondary contexts only — never a primary touch target.
  sm: 'h-9 px-3.5 text-body-sm gap-1.5 rounded-md',
  // 44px. The default, and the minimum comfortable touch target.
  md: 'h-11 px-5 text-body gap-2 rounded-lg',
  // 52px. Screen-level primary actions.
  lg: 'h-13 px-6 text-body-lg gap-2 rounded-lg',
};

const BASE =
  'relative inline-flex select-none items-center justify-center whitespace-nowrap font-medium ' +
  'transition-[background-color,color,opacity,transform] duration-fast ease-out ' +
  'active:scale-[0.985] disabled:pointer-events-none disabled:opacity-40';

export function buttonStyles(variant: Variant = 'primary', size: Size = 'md', className?: string) {
  return cn(BASE, VARIANTS[variant], SIZES[size], className);
}

interface CommonProps {
  variant?: Variant;
  size?: Size;
  fullWidth?: boolean;
  /** Rendered before the label, at the size's optical scale. */
  icon?: ReactNode;
  children?: ReactNode;
  className?: string;
}

type ButtonProps = CommonProps &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'className'> & {
    href?: undefined;
    /** Replaces the label with a spinner and blocks interaction. */
    loading?: boolean;
  };

type LinkProps = CommonProps &
  Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'children' | 'className' | 'href'> & {
    href: string;
    loading?: never;
  };

export function Button(props: ButtonProps | LinkProps) {
  const { variant = 'primary', size = 'md', fullWidth, icon, children, className } = props;
  const classes = buttonStyles(variant, size, cn(fullWidth && 'w-full', className));

  if (props.href !== undefined) {
    const { href, variant: _v, size: _s, fullWidth: _f, icon: _i, children: _c, className: _cn, ...rest } = props;
    return (
      <Link href={href} className={classes} {...rest}>
        {icon}
        {children}
      </Link>
    );
  }

  const {
    loading,
    disabled,
    variant: _v,
    size: _s,
    fullWidth: _f,
    icon: _i,
    children: _c,
    className: _cn,
    type,
    ...rest
  } = props;

  return (
    <button
      type={type ?? 'button'}
      disabled={disabled ?? loading}
      aria-busy={loading || undefined}
      className={classes}
      {...rest}
    >
      {/* The label keeps its space while loading, so the button never resizes. */}
      <span className={cn('inline-flex items-center gap-2', loading && 'invisible')}>
        {icon}
        {children}
      </span>
      {loading && (
        <span className="absolute inset-0 grid place-items-center">
          <Spinner />
        </span>
      )}
    </button>
  );
}

/** A square, label-less control. `label` is required — it becomes the a11y name. */
export function IconButton({
  label,
  variant = 'ghost',
  size = 'md',
  className,
  children,
  ...rest
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className' | 'children'> & {
  label: string;
  variant?: Variant;
  size?: Size;
  className?: string;
  children: ReactNode;
}) {
  const dimensions: Record<Size, string> = {
    sm: 'h-9 w-9 rounded-md',
    md: 'h-11 w-11 rounded-full',
    lg: 'h-13 w-13 rounded-full',
  };
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn(BASE, VARIANTS[variant], dimensions[size], 'p-0', className)}
      {...rest}
    >
      {children}
    </button>
  );
}

/** Indeterminate progress. Sized to the current font, so it fits any button. */
export function Spinner({ className }: { className?: string }) {
  return (
    <svg
      className={cn('h-[1.15em] w-[1.15em] animate-spin', className)}
      viewBox="0 0 24 24"
      fill="none"
      role="status"
      aria-label="Working"
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2.5" />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

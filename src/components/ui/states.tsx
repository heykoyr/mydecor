import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Button } from './button';
import { AlertIcon } from './icons';

/**
 * Empty and error states.
 *
 * Both follow the same three-part contract, because a state that only says what
 * happened has done half its job:
 *
 *   what is true  →  why it matters or what caused it  →  the way out
 *
 * The way out is mandatory. Neither component accepts being rendered without an
 * action unless the surrounding screen already provides one.
 */

export function EmptyState({
  title,
  body,
  action,
  className,
}: {
  title: string;
  body: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('mx-auto max-w-[34ch] px-6 py-16 text-center', className)}>
      <h3 className="font-serif text-h2 text-ink">{title}</h3>
      <p className="mt-2 text-body text-muted">{body}</p>
      {action && <div className="mt-6 flex justify-center">{action}</div>}
    </div>
  );
}

export interface ErrorStateProps {
  /** What went wrong, in the user's terms. Never an exception message. */
  title: string;
  /** Why, and what it means for them. */
  body: string;
  /** The primary recovery action. */
  onRetry?: () => void;
  retryLabel?: string;
  secondary?: ReactNode;
  /** Technical detail, collapsed. Shown only when it could help a support reply. */
  detail?: string;
  className?: string;
}

export function ErrorState({
  title,
  body,
  onRetry,
  retryLabel = 'Try again',
  secondary,
  detail,
  className,
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className={cn('mx-auto max-w-[36ch] px-6 py-14 text-center', className)}
    >
      <span className="mx-auto mb-4 grid h-11 w-11 place-items-center rounded-full bg-danger/10 text-danger">
        <AlertIcon size={22} />
      </span>
      <h3 className="font-serif text-h2 text-ink">{title}</h3>
      <p className="mt-2 text-body text-muted">{body}</p>

      {(onRetry || secondary) && (
        <div className="mt-6 flex flex-col items-center gap-2">
          {onRetry && (
            <Button onClick={onRetry} size="md">
              {retryLabel}
            </Button>
          )}
          {secondary}
        </div>
      )}

      {detail && (
        <details className="mt-6 text-left">
          <summary className="cursor-pointer text-caption text-faint">Technical detail</summary>
          <p className="mt-2 break-words font-mono text-caption text-faint">{detail}</p>
        </details>
      )}
    </div>
  );
}

/**
 * Narrated progress for work that takes long enough to need explaining.
 *
 * The messages describe what the system is doing, in order, and advance on a
 * timer independent of the actual work — the alternative is either a silent
 * spinner or exposing pipeline stages the user has no use for. It is announced
 * politely so screen reader users get the same reassurance.
 */
export function ProgressNarrative({
  message,
  className,
}: {
  message: string;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center gap-4', className)}>
      <ProgressPulse />
      <p aria-live="polite" className="text-body text-muted">
        {message}
      </p>
    </div>
  );
}

/** A slow, calm pulse. Deliberately not a spinner: this work takes seconds. */
function ProgressPulse() {
  return (
    <span className="relative grid h-8 w-8 place-items-center" aria-hidden="true">
      <span className="absolute inset-0 animate-breathe rounded-full border border-line-strong" />
      <span className="h-2 w-2 rounded-full bg-ink" />
    </span>
  );
}

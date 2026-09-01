'use client';

import type { Recommendation, Visualization } from '@/types/domain';
import { formatPrice } from '@/lib/utils';
import { Button, IconButton, Spinner } from '@/components/ui/button';
import { Segmented } from '@/components/ui/surfaces';
import { BookmarkIcon, CloseIcon, RefreshIcon, ShareIcon } from '@/components/ui/icons';

/**
 * The control surface for an in-room preview.
 *
 * Sits below the photograph rather than over it: the whole point of this state
 * is seeing the product in the room, and a panel covering a third of the image
 * would undo that. It carries the comparison toggle, the honest caption about
 * what the preview is, and the two things worth doing next.
 */
export function PreviewBar({
  recommendation,
  visualization,
  showOriginal,
  onShowOriginalChange,
  saved,
  onToggleSave,
  onRetry,
  onShare,
  onExit,
}: {
  recommendation: Recommendation;
  visualization: Visualization;
  showOriginal: boolean;
  onShowOriginalChange: (showOriginal: boolean) => void;
  saved: boolean;
  onToggleSave: () => void;
  onRetry: () => void;
  /** Absent until a result exists to share. */
  onShare?: () => void;
  onExit: () => void;
}) {
  const { product } = recommendation;
  const generating = visualization.status === 'generating';
  const failed = visualization.status === 'failed';

  return (
    <div
      className="shrink-0 border-t border-line bg-elevated px-4 pt-3"
      style={{ paddingBottom: 'max(14px, var(--inset-bottom))' }}
    >
      <div className="mx-auto w-full max-w-wide">
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-md bg-sunken">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={product.image.src}
              alt=""
              className="h-[78%] w-[78%] object-contain"
            />
          </span>

          <div className="min-w-0 flex-1">
            <p className="truncate text-body-sm font-medium text-ink">{product.name}</p>
            <p className="text-body-sm text-muted">
              {formatPrice(product.price, product.currency)}
            </p>
          </div>

          <IconButton
            label="Close preview"
            variant="ghost"
            size="sm"
            onClick={onExit}
            className="shrink-0 text-muted"
          >
            <CloseIcon size={20} />
          </IconButton>
        </div>

        {failed ? (
          <div className="mt-3 flex items-center justify-between gap-3">
            <p className="text-body-sm text-muted">
              {visualization.failureReason ?? "We couldn't place this one."}
            </p>
            <Button size="sm" variant="secondary" onClick={onRetry} icon={<RefreshIcon size={16} />}>
              Try again
            </Button>
          </div>
        ) : (
          <div className="mt-3 flex items-center gap-3">
            <Segmented
              label="Compare with the original photo"
              value={showOriginal ? 'original' : 'preview'}
              onChange={(value) => onShowOriginalChange(value === 'original')}
              options={[
                { value: 'preview', label: 'Preview' },
                { value: 'original', label: 'Original' },
              ]}
            />

            <div className="ml-auto flex items-center gap-2">
              {generating && <Spinner className="text-muted" />}
              {onShare && (
                <IconButton
                  label="Share this preview"
                  variant="secondary"
                  size="sm"
                  onClick={onShare}
                  className="shrink-0"
                >
                  <ShareIcon size={17} />
                </IconButton>
              )}
              <Button
                size="sm"
                variant={saved ? 'secondary' : 'primary'}
                onClick={onToggleSave}
                icon={<BookmarkIcon size={16} filled={saved} />}
              >
                {saved ? 'Saved' : 'Save'}
              </Button>
            </div>
          </div>
        )}

        {!failed && (
          <p className="mt-2.5 text-caption text-faint">
            {/*
              The app has no measurement of the room. Saying so once, quietly,
              in the place where the claim is being made is the honest version
              of a disclaimer.
            */}
            Indicative preview — placed to scale with the space, not measured.
          </p>
        )}
      </div>
    </div>
  );
}

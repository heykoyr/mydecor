'use client';

import { AnimatePresence, motion, useDragControls, type PanInfo } from 'framer-motion';
import { useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';
import {
  useBodyScrollLock,
  useEscapeKey,
  useFocusTrap,
  useIsWide,
  useMounted,
  usePrefersReducedMotion,
} from '@/lib/hooks';
import { CloseIcon } from './icons';
import { IconButton } from './button';

/**
 * The modal surface, and the only one in the product.
 *
 * It adapts rather than duplicating: a bottom sheet on phones, where the
 * content should rise from the thumb and the room photo stays visible above it;
 * a right-hand panel on wide screens, where covering the room would defeat the
 * point of showing a product against it.
 *
 * Dragging to dismiss is bound to the header, not the panel. Binding it to the
 * whole panel fights any scrollable content inside, which is the usual reason
 * bottom sheets feel broken.
 */

/** Drag distance or velocity past which a downward flick dismisses the sheet. */
const DISMISS_DISTANCE = 110;
const DISMISS_VELOCITY = 520;

export interface SheetProps {
  open: boolean;
  onClose: () => void;
  /** Announced as the dialog's accessible name. */
  title: string;
  /** Set false to present the title only to screen readers. */
  showTitle?: boolean;
  description?: string;
  children: ReactNode;
  /** Pinned to the bottom edge, outside the scroll area. */
  footer?: ReactNode;
  /** Fills the panel edge-to-edge — used when the content leads with an image. */
  bleed?: boolean;
  className?: string;
}

export function Sheet({
  open,
  onClose,
  title,
  showTitle = true,
  description,
  children,
  footer,
  bleed = false,
  className,
}: SheetProps) {
  const mounted = useMounted();
  const isWide = useIsWide();
  const reduceMotion = usePrefersReducedMotion();
  const panelRef = useRef<HTMLDivElement>(null);
  const dragControls = useDragControls();
  const titleId = useId();
  const descriptionId = useId();

  useBodyScrollLock(open);
  useFocusTrap(panelRef, open);
  useEscapeKey(open, onClose);

  if (!mounted) return null;

  const onDragEnd = (_: unknown, info: PanInfo) => {
    const past = isWide
      ? info.offset.x > DISMISS_DISTANCE || info.velocity.x > DISMISS_VELOCITY
      : info.offset.y > DISMISS_DISTANCE || info.velocity.y > DISMISS_VELOCITY;
    if (past) onClose();
  };

  const enter = isWide ? { x: 0 } : { y: 0 };
  const exit = isWide ? { x: '100%' } : { y: '100%' };

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-sheet">
          <motion.div
            className="absolute inset-0 bg-black/35"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.22 }}
            onClick={onClose}
            aria-hidden="true"
          />

          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={description ? descriptionId : undefined}
            tabIndex={-1}
            className={cn(
              'absolute flex flex-col overflow-hidden bg-elevated shadow-e3 outline-none',
              isWide
                ? 'inset-y-0 right-0 w-[min(30rem,42vw)] border-l border-line'
                : 'inset-x-0 bottom-0 max-h-[88dvh] rounded-t-2xl',
              className,
            )}
            initial={exit}
            animate={enter}
            exit={exit}
            transition={
              reduceMotion
                ? { duration: 0 }
                : { type: 'spring', stiffness: 420, damping: 42, mass: 0.9 }
            }
            drag={reduceMotion ? false : isWide ? 'x' : 'y'}
            // Drag is started by the header only; see SheetHeader.
            dragListener={false}
            dragControls={dragControls}
            dragConstraints={isWide ? { left: 0, right: 0 } : { top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.4, left: 0, right: 0.4 }}
            onDragEnd={onDragEnd}
          >
            <SheetHeader
              titleId={titleId}
              descriptionId={descriptionId}
              title={title}
              showTitle={showTitle}
              description={description}
              onClose={onClose}
              isWide={isWide}
              onDragStart={(event) => {
                if (!reduceMotion) dragControls.start(event);
              }}
            />

            <div
              className={cn(
                'min-h-0 flex-1 overflow-y-auto overscroll-contain',
                !bleed && 'px-5 pb-6',
              )}
            >
              {children}
            </div>

            {footer && (
              <div
                className="border-t border-line bg-elevated px-5 pt-4"
                style={{ paddingBottom: 'max(16px, var(--inset-bottom))' }}
              >
                {footer}
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

function SheetHeader({
  titleId,
  descriptionId,
  title,
  showTitle,
  description,
  onClose,
  isWide,
  onDragStart,
}: {
  titleId: string;
  descriptionId: string;
  title: string;
  showTitle: boolean;
  description?: string;
  onClose: () => void;
  isWide: boolean;
  onDragStart: (event: React.PointerEvent) => void;
}) {
  // The header doubles as the drag surface, so it must not be selectable.
  return (
    <header
      onPointerDown={onDragStart}
      className={cn(
        'relative shrink-0 cursor-grab select-none touch-none active:cursor-grabbing',
        showTitle ? 'px-5 pb-3 pt-2' : 'px-5 pb-1 pt-2',
      )}
    >
      {!isWide && (
        <div className="mx-auto mb-3 h-1 w-9 rounded-full bg-line-strong" aria-hidden="true" />
      )}

      <div className="flex items-start gap-4">
        <div className="min-w-0 flex-1">
          <h2
            id={titleId}
            className={cn('font-serif text-h2 text-ink', !showTitle && 'sr-only')}
          >
            {title}
          </h2>
          {description && (
            <p
              id={descriptionId}
              className={cn('mt-1 text-body-sm text-muted', !showTitle && 'sr-only')}
            >
              {description}
            </p>
          )}
        </div>

        <IconButton
          label="Close"
          size="sm"
          variant="ghost"
          onClick={onClose}
          // Otherwise pressing close would begin a drag on the header behind it.
          onPointerDown={(event) => event.stopPropagation()}
          className="-mr-1.5 shrink-0 text-muted"
        >
          <CloseIcon size={20} />
        </IconButton>
      </div>
    </header>
  );
}

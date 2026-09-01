'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { create } from 'zustand';
import { createPortal } from 'react-dom';
import { createId } from '@/lib/utils';
import { useMounted } from '@/lib/hooks';

/**
 * Transient confirmation.
 *
 * Toasts acknowledge an action the user just took ("Saved to your products").
 * They are never used to report an error the user must act on — that belongs in
 * the surface where the failure happened, with a recovery action attached.
 */

const DEFAULT_DURATION = 3200;

export interface Toast {
  id: string;
  message: string;
  /** An optional single action, e.g. undo. */
  action?: { label: string; onPress: () => void };
}

interface ToastStore {
  toasts: Toast[];
  show: (message: string, options?: { action?: Toast['action']; duration?: number }) => void;
  dismiss: (id: string) => void;
}

export const useToastStore = create<ToastStore>((set, get) => ({
  toasts: [],
  show: (message, options) => {
    const id = createId('toast');
    // One at a time: stacked toasts compete with each other and with the tab bar.
    set({ toasts: [{ id, message, action: options?.action }] });
    window.setTimeout(() => get().dismiss(id), options?.duration ?? DEFAULT_DURATION);
  },
  dismiss: (id) => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
}));

/** Convenience accessor, so components don't subscribe to the whole store. */
export const toast = (message: string, options?: { action?: Toast['action']; duration?: number }) =>
  useToastStore.getState().show(message, options);

export function Toaster() {
  const mounted = useMounted();
  const toasts = useToastStore((state) => state.toasts);
  const dismiss = useToastStore((state) => state.dismiss);

  if (!mounted) return null;

  return createPortal(
    <div
      className="pointer-events-none fixed inset-x-0 z-toast flex justify-center px-4"
      // Sits above the tab bar on mobile and clear of the safe area.
      style={{ bottom: 'calc(var(--tabbar-h) + var(--inset-bottom) + 12px)' }}
    >
      <AnimatePresence>
        {toasts.map((item) => (
          <motion.div
            key={item.id}
            role="status"
            aria-live="polite"
            className="pointer-events-auto flex w-full max-w-content items-center gap-3 rounded-lg bg-ink px-4 py-3 text-inverse shadow-e2"
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 460, damping: 38 }}
          >
            <span className="min-w-0 flex-1 text-body-sm">{item.message}</span>
            {item.action && (
              <button
                type="button"
                onClick={() => {
                  item.action?.onPress();
                  dismiss(item.id);
                }}
                className="shrink-0 text-body-sm font-semibold underline underline-offset-2"
              >
                {item.action.label}
              </button>
            )}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>,
    document.body,
  );
}

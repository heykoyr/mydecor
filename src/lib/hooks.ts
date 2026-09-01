'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/** Tracks a media query. Returns `false` during SSR and the first paint. */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const list = window.matchMedia(query);
    setMatches(list.matches);
    const onChange = (event: MediaQueryListEvent) => setMatches(event.matches);
    list.addEventListener('change', onChange);
    return () => list.removeEventListener('change', onChange);
  }, [query]);

  return matches;
}

/** True from the tablet breakpoint up. The single source for layout branching. */
export function useIsWide(): boolean {
  return useMediaQuery('(min-width: 768px)');
}

export function usePrefersReducedMotion(): boolean {
  return useMediaQuery('(prefers-reduced-motion: reduce)');
}

/**
 * Prevents the page behind a modal surface from scrolling.
 *
 * Compensates for the scrollbar's width so the layout doesn't jump on desktop
 * when it disappears.
 */
export function useBodyScrollLock(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    const { body } = document;
    const previousOverflow = body.style.overflow;
    const previousPadding = body.style.paddingRight;
    const scrollbar = window.innerWidth - document.documentElement.clientWidth;

    body.style.overflow = 'hidden';
    if (scrollbar > 0) body.style.paddingRight = `${scrollbar}px`;

    return () => {
      body.style.overflow = previousOverflow;
      body.style.paddingRight = previousPadding;
    };
  }, [active]);
}

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

/**
 * Traps Tab within `ref` while `active`, moves focus in on open, and returns it
 * to whatever was focused before on close.
 */
export function useFocusTrap(ref: React.RefObject<HTMLElement | null>, active: boolean): void {
  useEffect(() => {
    if (!active) return;
    const container = ref.current;
    if (!container) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;

    // Defer so the element exists and any entrance transition has begun.
    const focusTimer = window.setTimeout(() => {
      const first = container.querySelector<HTMLElement>(FOCUSABLE);
      (first ?? container).focus({ preventScroll: true });
    }, 40);

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const items = [...container.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
        (element) => element.offsetParent !== null,
      );
      if (items.length === 0) return;

      const first = items[0]!;
      const last = items[items.length - 1]!;
      const current = document.activeElement;

      if (event.shiftKey && (current === first || current === container)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && current === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener('keydown', onKeyDown);
      previouslyFocused?.focus?.({ preventScroll: true });
    };
  }, [ref, active]);
}

/** Calls `handler` on Escape while `active`. */
export function useEscapeKey(active: boolean, handler: () => void): void {
  const saved = useRef(handler);
  saved.current = handler;

  useEffect(() => {
    if (!active) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') saved.current();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [active]);
}

/** True once mounted on the client. Gates portals and other DOM-only work. */
export function useMounted(): boolean {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted;
}

/**
 * Reports which item in a horizontal snap rail is currently centred, for
 * carousel position indicators.
 */
export function useRailIndex(itemCount: number) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [index, setIndex] = useState(0);

  const onScroll = useCallback(() => {
    const element = ref.current;
    if (!element || itemCount === 0) return;
    const progress = element.scrollLeft / Math.max(element.scrollWidth - element.clientWidth, 1);
    setIndex(Math.round(progress * (itemCount - 1)));
  }, [itemCount]);

  return { ref, index, onScroll };
}

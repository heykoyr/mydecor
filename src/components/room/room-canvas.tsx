'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * The room photograph, and the coordinate space everything overlays onto.
 *
 * The frame is measured rather than sized by CSS. `aspect-ratio` combined with
 * both a max-width and a max-height does not reliably produce a
 * maximally-fitted box — the browser clamps one axis without recomputing the
 * other, and the frame ends up taller than its image. Since normalised (0–1)
 * hotspot coordinates are only valid if the frame matches the rendered image
 * exactly, that has to be exact rather than nearly right.
 *
 * So: observe the available space, compute the largest box of the photograph's
 * ratio that fits, and set it. The image then fills the frame precisely, and
 * every overlay is a plain CSS percentage with no letterboxing to correct for.
 */
export function RoomCanvas({
  src,
  alt,
  aspectRatio,
  overlay,
  className,
}: {
  src: string;
  alt: string;
  /** width / height of the source photograph. */
  aspectRatio: number;
  /** Positioned children, in normalised coordinates. */
  overlay?: ReactNode;
  className?: string;
}) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [frame, setFrame] = useState<{ width: number; height: number } | null>(null);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;

    const measure = () => {
      const { width, height } = wrapper.getBoundingClientRect();
      if (width < 1 || height < 1) return;
      const fittedWidth = Math.min(width, height * aspectRatio);
      setFrame({ width: fittedWidth, height: fittedWidth / aspectRatio });
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(wrapper);
    return () => observer.disconnect();
  }, [aspectRatio]);

  return (
    <div ref={wrapperRef} className={cn('relative min-h-0 overflow-hidden', className)}>
      {/*
        A photograph almost never matches the viewport's shape, so there is
        always letterboxing. Filling it with a blurred, darkened copy of the
        same photo keeps the screen feeling like one image rather than a
        picture sitting in a black box — and it costs nothing, since the
        browser has already decoded this exact source.
      */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt=""
        aria-hidden="true"
        className="absolute inset-0 h-full w-full scale-110 object-cover opacity-30 blur-2xl"
      />

      <div
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
        style={
          frame
            ? { width: frame.width, height: frame.height }
            : // Before the first measurement, occupy nothing rather than
              // flashing a wrongly-sized image.
              { width: 0, height: 0, opacity: 0 }
        }
      >
        {/*
          Not next/image: the source is a data URL held in local storage, so
          there is no remote asset for the optimiser to fetch, resize or cache.
        */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={alt}
          className="absolute inset-0 h-full w-full object-fill"
          draggable={false}
        />
        {overlay}
      </div>
    </div>
  );
}

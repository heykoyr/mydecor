import Link from 'next/link';
import type { Room } from '@/types/domain';
import { cn, formatRelativeTime, humanise } from '@/lib/utils';
import { ImageFrame, Skeleton } from '@/components/ui/surfaces';

/**
 * A saved room in a list.
 *
 * The photograph carries the card; the text underneath is small, quiet, and
 * exists only to tell two rooms of the same type apart. Metadata never competes
 * with the image for attention.
 */
export function RoomCard({ room, className }: { room: Room; className?: string }) {
  const opportunities = room.analysis?.opportunities.length ?? 0;
  const roomType = room.analysis ? humanise(room.analysis.roomType) : null;

  return (
    <Link
      href={`/room/${room.id}`}
      className={cn('group block rounded-lg focus-visible:shadow-focus', className)}
    >
      <ImageFrame ratio={4 / 3} className="photo-edge">
        {/*
          Thumbnails are pre-scaled data URLs written at capture time, so a list
          of twenty rooms never decodes twenty full-resolution photographs.
        */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={room.thumbnail}
          alt={`${room.name}, photographed ${formatRelativeTime(room.createdAt)}`}
          className="h-full w-full object-cover transition-transform duration-slow ease-out group-hover:scale-[1.02]"
          loading="lazy"
          decoding="async"
        />
      </ImageFrame>

      <div className="mt-3 flex items-baseline justify-between gap-3">
        <h3 className="truncate text-body font-medium text-ink">{room.name}</h3>
        <span className="shrink-0 text-caption text-faint">
          {formatRelativeTime(room.createdAt)}
        </span>
      </div>

      <p className="mt-0.5 text-body-sm text-muted">
        {opportunities > 0
          ? `${opportunities} ${opportunities === 1 ? 'idea' : 'ideas'}`
          : 'Not analysed yet'}
        {/* The room is usually named after its type, so only say the type when
            the user has renamed it to something else. */}
        {roomType && roomType !== room.name ? ` · ${roomType}` : ''}
      </p>
    </Link>
  );
}

export function RoomCardSkeleton() {
  return (
    <div>
      <Skeleton className="aspect-[4/3] w-full rounded-lg" />
      <Skeleton className="mt-3 h-4 w-2/3" />
      <Skeleton className="mt-2 h-3.5 w-1/3" />
    </div>
  );
}

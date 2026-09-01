'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { Product, Room } from '@/types/domain';
import { formatPrice, formatRelativeTime } from '@/lib/utils';
import { resolveCollections, type ResolvedCollection } from '@/lib/products/collections';
import { roomRepository, savedProductRepository } from '@/lib/data/repositories';
import { track } from '@/lib/analytics/analytics';
import { Sheet } from '@/components/ui/sheet';
import { Button, IconButton } from '@/components/ui/button';
import { BookmarkIcon, CameraIcon, ChevronRightIcon } from '@/components/ui/icons';
import { Skeleton } from '@/components/ui/surfaces';
import { ErrorState } from '@/components/ui/states';
import { toast } from '@/components/ui/toast';
import { ProductDetail } from './product-detail';

/**
 * Discovery.
 *
 * Editorial rather than exhaustive: a handful of arguments about rooms, each
 * with a few things that make the argument. The point of contact with the rest
 * of the product is "Try it in a room" — discovery that cannot reach the
 * preview is just a catalogue with better typography.
 */

type State =
  | { status: 'loading' }
  | { status: 'ready'; collections: ResolvedCollection[]; rooms: Room[] }
  | { status: 'error' };

export function DiscoverFeed() {
  const router = useRouter();
  const [state, setState] = useState<State>({ status: 'loading' });
  const [selected, setSelected] = useState<Product | null>(null);
  const [savedIds, setSavedIds] = useState<ReadonlySet<string>>(new Set());
  const [choosingRoom, setChoosingRoom] = useState(false);

  useEffect(() => {
    let active = true;
    Promise.all([
      resolveCollections(),
      roomRepository.list().catch(() => [] as Room[]),
      savedProductRepository.list().catch(() => []),
    ])
      .then(([collections, rooms, saved]) => {
        if (!active) return;
        setState({ status: 'ready', collections, rooms });
        setSavedIds(new Set(saved.map((entry) => entry.productId)));
      })
      .catch(() => active && setState({ status: 'error' }));
    return () => {
      active = false;
    };
  }, []);

  const toggleSave = (product: Product) => {
    const next = new Set(savedIds);
    if (next.has(product.id)) {
      next.delete(product.id);
      void savedProductRepository.remove(product.id);
      track('product_unsaved', { productId: product.id });
      toast('Removed from saved');
    } else {
      next.add(product.id);
      void savedProductRepository.add({
        productId: product.id,
        savedAt: new Date().toISOString(),
        product,
      });
      track('product_saved', { productId: product.id, category: product.category });
      toast('Saved');
    }
    setSavedIds(next);
  };

  if (state.status === 'loading') {
    return (
      <div aria-busy="true" className="mt-10 space-y-12">
        <Skeleton className="h-7 w-56" />
        <Skeleton className="h-52 w-full" />
        <Skeleton className="h-52 w-full" />
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <ErrorState
        title="We couldn't load these"
        body="Something went wrong reading the catalogue. Your rooms are unaffected."
        onRetry={() => router.refresh()}
      />
    );
  }

  const rooms = state.rooms;
  const saved = selected ? savedIds.has(selected.id) : false;

  return (
    <>
      <div className="mt-8 space-y-14 md:mt-12 md:space-y-20">
        {state.collections.map((collection) => (
          <section key={collection.id} aria-labelledby={collection.id}>
            <h2
              id={collection.id}
              className="font-serif text-h1 text-balance text-ink md:max-w-[18ch]"
            >
              {collection.title}
            </h2>
            <p className="mt-3 max-w-[52ch] text-body-lg text-muted">{collection.standfirst}</p>

            <div className="rail -mx-4 mt-7 flex gap-4 overflow-x-auto px-4 md:mx-0 md:px-0">
              {collection.products.map((product) => (
                <button
                  key={product.id}
                  type="button"
                  onClick={() => {
                    setSelected(product);
                    setChoosingRoom(false);
                    track('product_viewed', {
                      productId: product.id,
                      category: product.category,
                      source: 'discover',
                    });
                  }}
                  className="group w-[10.5rem] shrink-0 rounded-lg text-left focus-visible:shadow-focus md:w-[12rem]"
                >
                  <div className="relative aspect-[4/5] w-full overflow-hidden rounded-lg bg-sunken">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={product.image.src}
                      alt={product.image.alt}
                      loading="lazy"
                      decoding="async"
                      className="absolute inset-[13%] h-[74%] w-[74%] object-contain transition-transform duration-slow ease-out group-hover:scale-[1.04]"
                    />
                  </div>
                  {/* Two lines reserved, so prices align across a row whether
                      or not a name wraps. */}
                  <h3 className="mt-2.5 line-clamp-2 min-h-[2.6em] text-body-sm font-medium leading-snug text-ink">
                    {product.name}
                  </h3>
                  <p className="mt-1 text-body-sm text-muted">
                    {formatPrice(product.price, product.currency)}
                  </p>
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>

      {selected && (
        <Sheet
          open
          onClose={() => setSelected(null)}
          title={choosingRoom ? 'Which room?' : selected.name}
          onBack={choosingRoom ? () => setChoosingRoom(false) : undefined}
          footer={
            choosingRoom ? undefined : (
              <div className="flex items-center gap-3">
                {rooms.length > 0 ? (
                  <Button size="lg" fullWidth onClick={() => setChoosingRoom(true)}>
                    Try it in a room
                  </Button>
                ) : (
                  <Button size="lg" fullWidth href="/scan" icon={<CameraIcon size={19} />}>
                    Scan a room to try it
                  </Button>
                )}
                <IconButton
                  label={saved ? 'Remove from saved' : 'Save this product'}
                  variant="secondary"
                  size="lg"
                  aria-pressed={saved}
                  onClick={() => toggleSave(selected)}
                  className="shrink-0"
                >
                  <BookmarkIcon size={20} filled={saved} />
                </IconButton>
              </div>
            )
          }
        >
          {choosingRoom ? (
            <ul className="divide-y divide-line">
              {rooms.map((room) => (
                <li key={room.id}>
                  <button
                    type="button"
                    onClick={() => router.push(`/room/${room.id}?product=${selected.id}`)}
                    className="flex w-full items-center gap-4 py-3 text-left"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={room.thumbnail}
                      alt=""
                      className="h-14 w-20 shrink-0 rounded-md object-cover"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-body font-medium text-ink">
                        {room.name}
                      </span>
                      <span className="block text-body-sm text-muted">
                        {formatRelativeTime(room.createdAt)}
                      </span>
                    </span>
                    <ChevronRightIcon size={18} className="shrink-0 text-faint" />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <ProductDetail product={selected} />
          )}
        </Sheet>
      )}
    </>
  );
}

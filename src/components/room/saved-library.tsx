'use client';

import { useCallback, useEffect, useState } from 'react';
import type { Product, Room, SavedProduct } from '@/types/domain';
import { roomRepository, savedProductRepository } from '@/lib/data/repositories';
import { productRepository } from '@/lib/products/repository';
import { lookupRetailer } from '@/lib/products/retailers';
import { formatPrice } from '@/lib/utils';
import { track } from '@/lib/analytics/analytics';
import { Button, IconButton } from '@/components/ui/button';
import { BookmarkIcon, CameraIcon } from '@/components/ui/icons';
import { Segmented, Skeleton } from '@/components/ui/surfaces';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { toast } from '@/components/ui/toast';
import { RoomCard, RoomCardSkeleton } from './room-card';

/**
 * Everything the user has kept.
 *
 * One library with two views rather than two pages: rooms and products are the
 * same act of keeping something for later, and separating them into destinations
 * would make the user decide where a thing lives before they can find it.
 */

type Tab = 'rooms' | 'products';

interface SavedEntry {
  saved: SavedProduct;
  product: Product;
}

type State =
  | { status: 'loading' }
  | { status: 'ready'; rooms: Room[]; products: SavedEntry[] }
  | { status: 'error' };

export function SavedLibrary() {
  const [state, setState] = useState<State>({ status: 'loading' });
  const [tab, setTab] = useState<Tab>('rooms');

  const load = useCallback(() => {
    setState({ status: 'loading' });
    Promise.all([roomRepository.list(), savedProductRepository.list()])
      .then(async ([rooms, saved]) => {
        const products = await productRepository.byIds(saved.map((item) => item.productId));
        const byId = new Map(products.map((product) => [product.id, product]));
        const entries = saved
          .map((item) => {
            // The catalogue is authoritative when it still has the item; the
            // snapshot taken at save time covers withdrawn listings and live
            // sources that cannot be queried by id.
            const product = byId.get(item.productId) ?? item.product;
            return product ? { saved: item, product } : null;
          })
          .filter((entry): entry is SavedEntry => entry !== null);

        setState({ status: 'ready', rooms, products: entries });
        // Land on whichever view actually has something in it.
        if (rooms.length === 0 && entries.length > 0) setTab('products');
      })
      .catch(() => setState({ status: 'error' }));
  }, []);

  useEffect(load, [load]);

  const unsave = useCallback(
    async (product: Product) => {
      await savedProductRepository.remove(product.id).catch(() => undefined);
      track('product_unsaved', { productId: product.id });
      setState((current) =>
        current.status === 'ready'
          ? {
              ...current,
              products: current.products.filter((entry) => entry.product.id !== product.id),
            }
          : current,
      );
      toast('Removed from saved');
    },
    [],
  );

  if (state.status === 'loading') {
    return (
      <div
        aria-busy="true"
        className="mt-8 grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-3 lg:grid-cols-4"
      >
        <RoomCardSkeleton />
        <RoomCardSkeleton />
        <RoomCardSkeleton />
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <ErrorState
        title="We can't reach your library"
        body="This browser is blocking local storage, which is where your rooms and saved products are kept. Private windows do this by default."
        onRetry={load}
      />
    );
  }

  const { rooms, products } = state;

  if (rooms.length === 0 && products.length === 0) {
    return (
      <EmptyState
        title="Nothing saved yet"
        body="Rooms you scan and products you like are kept here, so you can come back to an idea instead of starting again."
        action={
          <Button href="/scan" icon={<CameraIcon size={18} />}>
            Scan your first room
          </Button>
        }
      />
    );
  }

  return (
    <div className="mt-6">
      <Segmented
        label="What to show"
        value={tab}
        onChange={setTab}
        options={[
          { value: 'rooms', label: `Rooms${rooms.length ? ` (${rooms.length})` : ''}` },
          { value: 'products', label: `Products${products.length ? ` (${products.length})` : ''}` },
        ]}
      />

      {tab === 'rooms' ? (
        <section className="mt-7">
          <h2 className="sr-only">Saved rooms</h2>
          {rooms.length === 0 ? (
            <EmptyState
              title="No rooms yet"
              body="Scan a space and it will be waiting here next time."
              action={
                <Button href="/scan" icon={<CameraIcon size={18} />}>
                  Scan a room
                </Button>
              }
            />
          ) : (
            <div className="grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-3 lg:grid-cols-4">
              {rooms.map((room) => (
                <RoomCard key={room.id} room={room} />
              ))}
            </div>
          )}
        </section>
      ) : (
        <section className="mt-7">
          <h2 className="sr-only">Saved products</h2>
          {products.length === 0 ? (
            <EmptyState
              title="No products yet"
              body="Open a spot in one of your rooms and save anything you want to think about."
            />
          ) : (
            <ul className="divide-y divide-line border-y border-line">
              {products.map(({ product }) => (
                <SavedProductRow
                  key={product.id}
                  product={product}
                  onRemove={() => void unsave(product)}
                />
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}

/**
 * A saved product as a row rather than a card.
 *
 * A saved list is read as a list — the user already knows what these look like,
 * and a grid of large images makes comparing prices and retailers harder than
 * it needs to be.
 */
function SavedProductRow({ product, onRemove }: { product: Product; onRemove: () => void }) {
  const retailer = lookupRetailer(product.retailerId);

  return (
    <li className="flex items-center gap-4 py-4">
      <span className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-md bg-sunken">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={product.image.src} alt="" className="h-[76%] w-[76%] object-contain" />
      </span>

      <div className="min-w-0 flex-1">
        <p className="truncate text-body font-medium text-ink">{product.name}</p>
        <p className="mt-0.5 text-body-sm text-muted">
          {formatPrice(product.price, product.currency)}
          {retailer ? ` · ${retailer.shortName}` : ''}
        </p>
      </div>

      <IconButton
        label={`Remove ${product.name} from saved`}
        variant="ghost"
        size="sm"
        onClick={onRemove}
        className="shrink-0 text-muted"
      >
        <BookmarkIcon size={19} filled />
      </IconButton>
    </li>
  );
}

export function SavedLibrarySkeleton() {
  return <Skeleton className="mt-8 h-64 w-full" />;
}

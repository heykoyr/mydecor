'use client';

import { useEffect, useState } from 'react';
import type { Room } from '@/types/domain';
import { roomRepository } from '@/lib/data/repositories';
import { Button } from '@/components/ui/button';
import { CameraIcon } from '@/components/ui/icons';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { RoomCard, RoomCardSkeleton } from './room-card';

type State =
  | { status: 'loading' }
  | { status: 'ready'; rooms: Room[] }
  | { status: 'error' };

/**
 * Everything the user has kept.
 *
 * Currently rooms only. Saved products join this screen when the catalogue
 * lands, as a second section rather than a second page — the mental model is
 * one library, not two.
 */
export function SavedLibrary() {
  const [state, setState] = useState<State>({ status: 'loading' });

  const load = () => {
    setState({ status: 'loading' });
    roomRepository
      .list()
      .then((rooms) => setState({ status: 'ready', rooms }))
      .catch(() => setState({ status: 'error' }));
  };

  useEffect(load, []);

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
        title="We can't reach your saved rooms"
        body="This browser is blocking local storage, which is where your rooms are kept. Private windows do this by default."
        onRetry={load}
      />
    );
  }

  if (state.rooms.length === 0) {
    return (
      <EmptyState
        title="Nothing saved yet"
        body="Rooms you scan are kept here, so you can come back to an idea instead of starting again."
        action={
          <Button href="/scan" icon={<CameraIcon size={18} />}>
            Scan your first room
          </Button>
        }
      />
    );
  }

  return (
    <section className="mt-8">
      <h2 className="sr-only">Saved rooms</h2>
      <div className="grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-3 lg:grid-cols-4">
        {state.rooms.map((room) => (
          <RoomCard key={room.id} room={room} />
        ))}
      </div>
    </section>
  );
}

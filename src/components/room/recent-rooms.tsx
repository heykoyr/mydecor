'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { Room } from '@/types/domain';
import { roomRepository } from '@/lib/data/repositories';
import { SectionHeader } from '@/components/ui/surfaces';
import { ChevronRightIcon } from '@/components/ui/icons';
import { RoomCard, RoomCardSkeleton } from './room-card';

/** How many rooms the home screen shows before deferring to the full list. */
const PREVIEW_COUNT = 4;

type State =
  | { status: 'loading' }
  | { status: 'ready'; rooms: Room[] }
  | { status: 'unavailable' };

/**
 * The user's own rooms on the home screen.
 *
 * Three outcomes, each with somewhere to go: rooms to return to, a first-run
 * explanation of the loop, or an honest notice that this browser will not let
 * us keep anything. The last one matters — private browsing refuses IndexedDB,
 * and silently showing an empty list would look like data loss.
 */
export function RecentRooms() {
  const [state, setState] = useState<State>({ status: 'loading' });

  useEffect(() => {
    let active = true;
    roomRepository
      .list()
      .then((rooms) => active && setState({ status: 'ready', rooms }))
      .catch(() => active && setState({ status: 'unavailable' }));
    return () => {
      active = false;
    };
  }, []);

  if (state.status === 'loading') {
    return (
      <section aria-busy="true">
        <SectionHeader title="Your rooms" />
        <div className="mt-5 grid grid-cols-2 gap-x-4 gap-y-8">
          <RoomCardSkeleton />
          <RoomCardSkeleton />
        </div>
      </section>
    );
  }

  if (state.status === 'unavailable') {
    return <FirstRun note="This browser won't let us save rooms — private windows block local storage. Scanning still works, but the room won't be here when you come back." />;
  }

  if (state.rooms.length === 0) {
    return <FirstRun />;
  }

  const preview = state.rooms.slice(0, PREVIEW_COUNT);

  return (
    <section>
      <SectionHeader
        title="Your rooms"
        action={
          state.rooms.length > PREVIEW_COUNT ? (
            <Link
              href="/saved"
              className="inline-flex items-center gap-0.5 text-body-sm text-muted transition-colors hover:text-ink"
            >
              All {state.rooms.length}
              <ChevronRightIcon size={16} />
            </Link>
          ) : undefined
        }
      />

      <div className="mt-5 grid grid-cols-2 gap-x-4 gap-y-8">
        {preview.map((room) => (
          <RoomCard key={room.id} room={room} />
        ))}
      </div>
    </section>
  );
}

const STEPS = [
  {
    title: 'Photograph the space',
    body: 'A wall, a window, a corner. Whatever you are stuck on.',
  },
  {
    title: 'See what it is missing',
    body: 'We mark the places worth changing and why.',
  },
  {
    title: 'Try things in the room',
    body: 'Put a real product into your own photo before you buy it.',
  },
];

/**
 * First-run explanation.
 *
 * Numbered text rather than illustration: the loop is three steps and reads
 * faster as a list than as pictures of a thing the user has not done yet.
 */
function FirstRun({ note }: { note?: string }) {
  return (
    <section aria-label="How it works">
      <ol className="divide-y divide-line border-y border-line">
        {STEPS.map((step, index) => (
          <li key={step.title} className="flex gap-5 py-5">
            <span
              aria-hidden="true"
              className="mt-0.5 w-4 shrink-0 font-mono text-caption tabular-nums text-faint"
            >
              {index + 1}
            </span>
            <div className="min-w-0">
              <h3 className="text-body font-medium text-ink">{step.title}</h3>
              <p className="mt-1 text-body-sm text-muted">{step.body}</p>
            </div>
          </li>
        ))}
      </ol>

      {note && <p className="mt-5 text-body-sm text-warning">{note}</p>}
    </section>
  );
}

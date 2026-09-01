'use client';

import type { AnalyticsEvent, AnalyticsEventName } from '@/types/domain';
import { brand } from '@/config/brand';
import { createId } from '@/lib/utils';
import { idb, STORES } from '@/lib/data/db';

/**
 * Product instrumentation.
 *
 * Events exist to answer specific questions about the core loop — where people
 * drop out between photo and preview, which opportunity types earn taps, which
 * categories convert to an outbound click. Anything that does not help answer
 * one of those is not worth the event.
 *
 * `AnalyticsSink` is the seam: today events are buffered locally so the funnel
 * can be inspected during development; connecting a warehouse or a product
 * analytics vendor means registering a different sink, with no call-site
 * changes.
 */

export interface AnalyticsSink {
  name: string;
  send(event: AnalyticsEvent): void;
}

/** Keeps local storage bounded — this buffer is for inspection, not retention. */
const MAX_BUFFERED_EVENTS = 500;

const SESSION_KEY = `${brand.slug}.session`;

function sessionId(): string {
  if (typeof sessionStorage === 'undefined') return 'server';
  let id = sessionStorage.getItem(SESSION_KEY);
  if (!id) {
    id = createId('sess');
    sessionStorage.setItem(SESSION_KEY, id);
  }
  return id;
}

/** Buffers to IndexedDB and trims the oldest entries once over the cap. */
const localSink: AnalyticsSink = {
  name: 'local',
  send(event) {
    void idb
      .put(STORES.analytics, event)
      .then(async () => {
        const all = await idb.getAll<AnalyticsEvent>(STORES.analytics);
        if (all.length <= MAX_BUFFERED_EVENTS) return;
        const excess = all
          .sort((a, b) => a.timestamp.localeCompare(b.timestamp))
          .slice(0, all.length - MAX_BUFFERED_EVENTS);
        await Promise.all(excess.map((item) => idb.delete(STORES.analytics, item.id)));
      })
      // Instrumentation must never break the product it measures.
      .catch(() => undefined);
  },
};

const sinks: AnalyticsSink[] = [localSink];

export function registerSink(sink: AnalyticsSink): void {
  sinks.push(sink);
}

export function track(
  name: AnalyticsEventName,
  properties: AnalyticsEvent['properties'] = {},
): void {
  if (typeof window === 'undefined') return;

  const event: AnalyticsEvent = {
    id: createId('evt'),
    name,
    properties,
    sessionId: sessionId(),
    timestamp: new Date().toISOString(),
  };

  for (const sink of sinks) {
    try {
      sink.send(event);
    } catch {
      // A failing sink must not take down the others.
    }
  }

  if (process.env.NODE_ENV === 'development') {
    // eslint-disable-next-line no-console
    console.debug('[analytics]', name, properties);
  }
}

/** Reads the local buffer, newest first. Used by development tooling only. */
export async function readBufferedEvents(): Promise<AnalyticsEvent[]> {
  const all = await idb.getAll<AnalyticsEvent>(STORES.analytics);
  return all.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}

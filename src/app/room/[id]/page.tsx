import type { Metadata } from 'next';
import { RoomExperience } from '@/components/room/room-experience';

export const metadata: Metadata = { title: 'Your room' };

/**
 * Rooms live in the browser's local store, so this route only resolves the id.
 * Everything about the room — including whether it exists — is determined on
 * the client, which is also where the photograph is.
 *
 * `?product=` is read here rather than with `useSearchParams` in the client
 * component: passing it down as a prop keeps the room screen out of the
 * suspense boundary that hook would otherwise require.
 */
export default async function RoomPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ product?: string }>;
}) {
  const [{ id }, { product }] = await Promise.all([params, searchParams]);
  return <RoomExperience roomId={id} initialProductId={product} />;
}

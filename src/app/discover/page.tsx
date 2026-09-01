import type { Metadata } from 'next';
import { DiscoverFeed } from '@/components/product/discover-feed';

export const metadata: Metadata = { title: 'Discover' };

export default function DiscoverPage() {
  return (
    <div className="pt-8 md:pt-14">
      <h1 className="sr-only">Discover</h1>
      <DiscoverFeed />
    </div>
  );
}

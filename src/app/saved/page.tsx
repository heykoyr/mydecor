import type { Metadata } from 'next';
import { SavedLibrary } from '@/components/room/saved-library';

export const metadata: Metadata = { title: 'Saved' };

export default function SavedPage() {
  return (
    <div className="pt-8 md:pt-14">
      <h1 className="font-serif text-h1 text-ink">Saved</h1>
      <SavedLibrary />
    </div>
  );
}

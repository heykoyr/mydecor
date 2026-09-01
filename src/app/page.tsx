import { Button } from '@/components/ui/button';
import { CameraIcon } from '@/components/ui/icons';
import { RecentRooms } from '@/components/room/recent-rooms';

/**
 * Home.
 *
 * One job: make the primary action unmistakable within five seconds, and make
 * the promise legible before the user has committed a photograph.
 *
 * On wide screens the hero and the user's own rooms sit side by side rather
 * than stacked, so returning users land with their work already in view instead
 * of scrolling past a pitch they have read before.
 */
export default function HomePage() {
  return (
    <div className="grid gap-12 pt-6 md:grid-cols-12 md:gap-10 md:pt-20">
      <section className="md:col-span-5 md:pr-4">
        <h1 className="text-balance font-serif text-display text-ink">
          See what could work in your room.
        </h1>

        <p className="mt-5 max-w-[38ch] text-body-lg text-muted">
          Photograph any wall, window or corner. We&rsquo;ll find what the space is missing and
          show you how real products look in it.
        </p>

        <div className="mt-8">
          <Button href="/scan" size="lg" icon={<CameraIcon size={20} />}>
            Scan your space
          </Button>
        </div>

        <p className="mt-4 text-body-sm text-faint">
          Your photos stay on this device.
        </p>
      </section>

      <div className="md:col-span-7 md:pl-8">
        <RecentRooms />
      </div>
    </div>
  );
}

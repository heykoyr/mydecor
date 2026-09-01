'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { brand } from '@/config/brand';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { BookmarkIcon, CameraIcon, CompassIcon, HomeIcon } from '@/components/ui/icons';

/**
 * The application chrome.
 *
 * Two compositions rather than one stretched layout: a bottom tab bar within
 * thumb reach on phones, and a top bar on wide screens where the pointer is
 * already at the top of the window and vertical space is the scarce resource.
 *
 * Both disappear on the immersive routes. Capture and the room canvas are the
 * screens where the photograph *is* the interface, and persistent navigation
 * framing it would undercut that.
 */

const TABS = [
  { href: '/', label: 'Home', Icon: HomeIcon },
  { href: '/discover', label: 'Discover', Icon: CompassIcon },
  { href: '/saved', label: 'Saved', Icon: BookmarkIcon },
] as const;

/** Routes that own the full viewport and supply their own navigation. */
const IMMERSIVE = ['/scan', '/room/'];

function isImmersive(pathname: string): boolean {
  return IMMERSIVE.some((prefix) => pathname.startsWith(prefix));
}

export function AppChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? '/';
  const immersive = isImmersive(pathname);

  if (immersive) {
    return (
      <main id="main" className="min-h-[100dvh]">
        {children}
      </main>
    );
  }

  return (
    <div className="min-h-[100dvh]">
      <MobileHeader />
      <TopBar pathname={pathname} />
      <main
        id="main"
        className="mx-auto w-full max-w-wide px-4 md:px-8"
        // Clears the tab bar on mobile; the tab bar is not rendered on desktop.
        style={{ paddingBottom: 'calc(var(--tabbar-h) + var(--inset-bottom) + 24px)' }}
      >
        {children}
      </main>
      <TabBar pathname={pathname} />
    </div>
  );
}

function Wordmark() {
  return (
    <Link
      href="/"
      className="font-serif text-[1.35rem] leading-none tracking-[-0.02em] text-ink"
      aria-label={`${brand.name} home`}
    >
      {brand.name}
    </Link>
  );
}

/**
 * On phones the tab bar carries navigation, so the header carries only
 * identity — plus the one action that must be reachable from every screen.
 */
function MobileHeader() {
  return (
    <header
      className="flex items-center justify-between px-4 pb-2 md:hidden"
      style={{ paddingTop: 'max(14px, var(--inset-top))' }}
    >
      <Wordmark />
      <Link
        href="/scan"
        aria-label="Scan a room"
        className="-mr-2 grid h-11 w-11 place-items-center rounded-full text-ink transition-colors hover:bg-sunken"
      >
        <CameraIcon size={21} />
      </Link>
    </header>
  );
}

function TopBar({ pathname }: { pathname: string }) {
  return (
    <header className="sticky top-0 z-hotspot hidden border-b border-line bg-bg/85 backdrop-blur-md md:block">
      <div className="mx-auto flex h-16 max-w-wide items-center gap-8 px-8">
        <Wordmark />

        <nav aria-label="Primary" className="flex items-center gap-1">
          {TABS.map(({ href, label }) => {
            const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'rounded-md px-3 py-2 text-body-sm transition-colors duration-fast',
                  active ? 'text-ink' : 'text-muted hover:text-ink',
                )}
              >
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto">
          <Button href="/scan" size="sm" icon={<CameraIcon size={17} />}>
            Scan a room
          </Button>
        </div>
      </div>
    </header>
  );
}

function TabBar({ pathname }: { pathname: string }) {
  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-hotspot border-t border-line bg-bg/92 backdrop-blur-md md:hidden"
      style={{ paddingBottom: 'var(--inset-bottom)' }}
    >
      <ul className="mx-auto flex max-w-content items-stretch" style={{ height: 'var(--tabbar-h)' }}>
        {TABS.map(({ href, label, Icon }) => {
          const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex h-full flex-col items-center justify-center gap-1 transition-colors duration-fast',
                  active ? 'text-ink' : 'text-faint',
                )}
              >
                {href === '/saved' ? (
                  // Saved is the one tab with a filled state: it reflects
                  // whether the user has put something there, not just where
                  // they are.
                  <BookmarkIcon size={22} filled={active} />
                ) : (
                  <Icon size={22} />
                )}
                <span className="text-[0.6875rem] leading-none tracking-[0.01em]">{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

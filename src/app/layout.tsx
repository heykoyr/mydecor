import type { Metadata, Viewport } from 'next';
import { brand } from '@/config/brand';
import { AppChrome } from '@/components/nav/app-chrome';
import { Toaster } from '@/components/ui/toast';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(brand.url),
  title: {
    default: `${brand.name} — ${brand.tagline}`,
    template: `%s · ${brand.name}`,
  },
  description: brand.description,
  applicationName: brand.name,
  openGraph: {
    type: 'website',
    siteName: brand.name,
    title: `${brand.name} — ${brand.tagline}`,
    description: brand.description,
    url: brand.url,
  },
  twitter: { card: 'summary_large_image', title: brand.name, description: brand.description },
  // The product works on private photos of people's homes; keep it out of indexes
  // until there is a public marketing surface worth indexing.
  robots: { index: false, follow: false },
  formatDetection: { telephone: false, address: false, email: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // The capture and room screens are full-bleed; the browser chrome should
  // tint to match rather than framing the photograph in a contrasting bar.
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: brand.themeColor.light },
    { media: '(prefers-color-scheme: dark)', color: brand.themeColor.dark },
  ],
  viewportFit: 'cover',
};

/**
 * Applies the stored theme before first paint.
 *
 * Without this the page renders in the default palette and then corrects
 * itself, which on a dark-themed device is a white flash in a product whose
 * whole job is presenting photographs calmly.
 */
const THEME_SCRIPT = `(function(){try{var s=localStorage.getItem('${brand.slug}.theme');var d=window.matchMedia('(prefers-color-scheme: dark)').matches;var t=s==='dark'||((!s||s==='system')&&d)?'dark':'light';document.documentElement.setAttribute('data-theme',t);}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-modal focus:rounded-md focus:bg-ink focus:px-4 focus:py-2 focus:text-inverse"
        >
          Skip to content
        </a>
        <AppChrome>{children}</AppChrome>
        <Toaster />
      </body>
    </html>
  );
}

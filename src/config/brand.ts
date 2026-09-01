/**
 * Brand configuration.
 *
 * The product name is provisional. Everything user-facing that names the
 * product reads from here — page metadata, the app shell, the web manifest,
 * share text, and outbound attribution — so renaming is a change to this file
 * plus the asset filenames, not a search-and-replace across the codebase.
 *
 * Rule for contributors: never write the product's name as a string literal in
 * a component. Import `brand` instead.
 */

/**
 * The origin this build should treat as canonical.
 *
 * An explicit `NEXT_PUBLIC_APP_URL` always wins. Otherwise a production build on
 * Vercel resolves to the project's stable domain rather than the immutable
 * per-deployment host, so metadata and share links do not point at a URL that
 * only ever names one build; preview builds fall back to their own host, and
 * local development to localhost.
 */
function resolveOrigin(): string {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL;
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return 'http://localhost:3000';
}

export const brand = {
  /** Product name, as displayed. */
  name: 'MyDecor',

  /** Lowercase, URL- and package-safe form. */
  slug: 'mydecor',

  /** Positioning line. Short enough to sit under the wordmark. */
  tagline: 'See what fits.',

  /** One sentence. Used for meta description and link previews. */
  description:
    'Photograph a room and see what could work in it — real products, placed in your own space, before you buy.',

  /** Longer form, used on the home screen and in share text. */
  promise: 'Take a photo of your room and see what could work in it.',

  /**
   * Canonical origin.
   *
   * An explicit NEXT_PUBLIC_APP_URL wins. Failing that, Vercel's own
   * per-deployment host is used, so preview builds resolve their metadata
   * against themselves rather than against localhost. Local development falls
   * through to the last case.
   */
  url: resolveOrigin(),

  /** Home market. Sets the default currency and the reference catalogue's. */
  locale: 'en-NG',
  currency: 'NGN',

  /** Brand colour used for the browser theme colour and web manifest. */
  themeColor: { light: '#fbfaf7', dark: '#121110' },
} as const;

export type Brand = typeof brand;

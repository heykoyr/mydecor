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
   * Canonical origin. Set NEXT_PUBLIC_APP_URL per environment; the fallback
   * keeps local development and previews working without configuration.
   */
  url: process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',

  /** Locale and currency defaults until a user preference exists. */
  locale: 'en-GB',
  currency: 'GBP',

  /** Brand colour used for the browser theme colour and web manifest. */
  themeColor: { light: '#fbfaf7', dark: '#121110' },
} as const;

export type Brand = typeof brand;

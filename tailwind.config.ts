import type { Config } from 'tailwindcss';

/**
 * The design system is defined once, here and in `globals.css`.
 *
 * Colours resolve to CSS custom properties so a single token swap re-themes the
 * whole product (light/dark, and later per-market or per-partner theming).
 * Every value below is a deliberate step on a scale — nothing is ad hoc.
 */
const config: Config = {
  darkMode: ['class', '[data-theme="dark"]'],
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    // Replace, not extend: an unconstrained palette is how design systems rot.
    colors: {
      transparent: 'transparent',
      current: 'currentColor',
      black: '#000000',
      white: '#ffffff',

      bg: 'rgb(var(--c-bg) / <alpha-value>)',
      surface: 'rgb(var(--c-surface) / <alpha-value>)',
      elevated: 'rgb(var(--c-elevated) / <alpha-value>)',
      sunken: 'rgb(var(--c-sunken) / <alpha-value>)',

      ink: 'rgb(var(--c-ink) / <alpha-value>)',
      muted: 'rgb(var(--c-muted) / <alpha-value>)',
      faint: 'rgb(var(--c-faint) / <alpha-value>)',
      inverse: 'rgb(var(--c-inverse) / <alpha-value>)',

      line: 'rgb(var(--c-line) / <alpha-value>)',
      'line-strong': 'rgb(var(--c-line-strong) / <alpha-value>)',

      accent: 'rgb(var(--c-accent) / <alpha-value>)',
      'accent-soft': 'rgb(var(--c-accent-soft) / <alpha-value>)',
      success: 'rgb(var(--c-success) / <alpha-value>)',
      warning: 'rgb(var(--c-warning) / <alpha-value>)',
      danger: 'rgb(var(--c-danger) / <alpha-value>)',
    },

    spacing: {
      0: '0px',
      px: '1px',
      0.5: '2px',
      1: '4px',
      2: '8px',
      3: '12px',
      4: '16px',
      5: '20px',
      6: '24px',
      7: '28px',
      8: '32px',
      10: '40px',
      12: '48px',
      14: '56px',
      16: '64px',
      20: '80px',
      24: '96px',
      32: '128px',
    },

    borderRadius: {
      none: '0px',
      sm: '6px',
      md: '10px',
      lg: '16px',
      xl: '22px',
      '2xl': '30px',
      full: '9999px',
    },

    // Shadows carry elevation meaning only. There are three, and no more.
    boxShadow: {
      none: 'none',
      e1: '0 1px 2px rgb(var(--c-shadow) / 0.05)',
      e2: '0 4px 16px -6px rgb(var(--c-shadow) / 0.12), 0 1px 3px rgb(var(--c-shadow) / 0.05)',
      e3: '0 -8px 40px -12px rgb(var(--c-shadow) / 0.22)',
      focus: '0 0 0 2px rgb(var(--c-bg)), 0 0 0 4px rgb(var(--c-ink))',
    },

    fontFamily: {
      sans: 'var(--font-sans)',
      serif: 'var(--font-serif)',
      mono: 'var(--font-mono)',
    },

    // The full type scale. Components reference these names, never raw sizes.
    fontSize: {
      display: ['var(--t-display-size)', { lineHeight: '1.04', letterSpacing: '-0.022em', fontWeight: '400' }],
      h1: ['var(--t-h1-size)', { lineHeight: '1.14', letterSpacing: '-0.018em', fontWeight: '600' }],
      h2: ['1.375rem', { lineHeight: '1.22', letterSpacing: '-0.014em', fontWeight: '600' }],
      h3: ['1.0625rem', { lineHeight: '1.32', letterSpacing: '-0.008em', fontWeight: '600' }],
      'body-lg': ['1.0625rem', { lineHeight: '1.5', letterSpacing: '-0.006em', fontWeight: '400' }],
      body: ['0.9375rem', { lineHeight: '1.56', letterSpacing: '-0.003em', fontWeight: '400' }],
      'body-sm': ['0.84375rem', { lineHeight: '1.5', letterSpacing: '0em', fontWeight: '400' }],
      caption: ['0.75rem', { lineHeight: '1.4', letterSpacing: '0.005em', fontWeight: '400' }],
      label: ['0.6875rem', { lineHeight: '1.1', letterSpacing: '0.07em', fontWeight: '600' }],
    },

    extend: {
      maxWidth: { content: '520px', wide: '1120px' },
      transitionTimingFunction: {
        // One easing vocabulary: `out` for entrances, `spring` for direct manipulation.
        out: 'cubic-bezier(0.22, 1, 0.36, 1)',
        inout: 'cubic-bezier(0.65, 0, 0.35, 1)',
      },
      transitionDuration: { fast: '140ms', base: '220ms', slow: '380ms' },
      zIndex: { hotspot: '20', sheet: '50', modal: '60', toast: '70' },
      keyframes: {
        'fade-up': { from: { opacity: '0', transform: 'translateY(6px)' }, to: { opacity: '1', transform: 'none' } },
        shimmer: { '100%': { transform: 'translateX(100%)' } },
        breathe: { '0%,100%': { opacity: '0.55' }, '50%': { opacity: '1' } },
      },
      animation: {
        'fade-up': 'fade-up var(--motion-base) cubic-bezier(0.22,1,0.36,1) both',
        shimmer: 'shimmer 1.6s infinite',
        breathe: 'breathe 2.4s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};

export default config;

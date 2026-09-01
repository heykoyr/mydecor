import type { SVGProps } from 'react';

/**
 * The icon set.
 *
 * Deliberately small. Every icon here earns its place by appearing in a control
 * that would be ambiguous or too wide as text alone. Anything that reads fine
 * as a word stays a word.
 *
 * All icons share one geometry: 24px grid, 1.5px stroke, round caps and joins,
 * no fills. Mixing stroke weights across an icon set is the fastest way to make
 * an interface look assembled rather than designed.
 */

export type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Icon({ size = 24, children, ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {children}
    </svg>
  );
}

export const CameraIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M3 8.5A2.5 2.5 0 0 1 5.5 6h1.4a1 1 0 0 0 .83-.44l.74-1.12A1 1 0 0 1 9.3 4h5.4a1 1 0 0 1 .83.44l.74 1.12a1 1 0 0 0 .83.44h1.4A2.5 2.5 0 0 1 21 8.5v8A2.5 2.5 0 0 1 18.5 19h-13A2.5 2.5 0 0 1 3 16.5Z" />
    <circle cx="12" cy="12.5" r="3.5" />
  </Icon>
);

export const ImageIcon = (props: IconProps) => (
  <Icon {...props}>
    <rect x="3" y="4" width="18" height="16" rx="2.5" />
    <circle cx="8.5" cy="9.5" r="1.5" />
    <path d="m3.5 17 4.3-4.3a2 2 0 0 1 2.8 0l3.2 3.2m0 0 1.9-1.9a2 2 0 0 1 2.8 0l2 2m-6.7-.1 2.4 2.4" />
  </Icon>
);

export const ArrowLeftIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M19 12H5m0 0 6.5-6.5M5 12l6.5 6.5" />
  </Icon>
);

export const ArrowRightIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M5 12h14m0 0-6.5-6.5M19 12l-6.5 6.5" />
  </Icon>
);

export const ChevronRightIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="m9 5 7 7-7 7" />
  </Icon>
);

export const CloseIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Icon>
);

export const CheckIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="m4.5 12.5 5 5 10-11" />
  </Icon>
);

/** Save. Outlined by default, filled when the item is saved. */
export const BookmarkIcon = ({ filled = false, ...props }: IconProps & { filled?: boolean }) => (
  <Icon {...props} fill={filled ? 'currentColor' : 'none'}>
    <path d="M6 4.5h12a.5.5 0 0 1 .5.5v14.2a.4.4 0 0 1-.63.33L12 15.4l-5.87 4.13a.4.4 0 0 1-.63-.33V5a.5.5 0 0 1 .5-.5Z" />
  </Icon>
);

export const HomeIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M4 10.6 12 4l8 6.6V19a1 1 0 0 1-1 1h-4.2v-5.3H9.2V20H5a1 1 0 0 1-1-1Z" />
  </Icon>
);

export const CompassIcon = (props: IconProps) => (
  <Icon {...props}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="m14.9 9.1-1.4 4.4-4.4 1.4 1.4-4.4Z" />
  </Icon>
);

export const RefreshIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M19.5 12a7.5 7.5 0 1 1-2.4-5.5" />
    <path d="M19.8 4.6v3.9h-3.9" />
  </Icon>
);

export const ShareIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M12 15.5V4m0 0L8.2 7.8M12 4l3.8 3.8" />
    <path d="M6 12.5H5a1 1 0 0 0-1 1V19a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-5.5a1 1 0 0 0-1-1h-1" />
  </Icon>
);

export const ExternalIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M14 5h5v5M19 5l-7.5 7.5" />
    <path d="M18 14.5V18a1.5 1.5 0 0 1-1.5 1.5h-10A1.5 1.5 0 0 1 5 18V7.5A1.5 1.5 0 0 1 6.5 6H10" />
  </Icon>
);

export const TrashIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M4.5 6.5h15M9.5 6.5V5a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v1.5" />
    <path d="M6.5 6.5 7.3 19a1 1 0 0 0 1 .95h7.4a1 1 0 0 0 1-.95l.8-12.5" />
    <path d="M10.5 10v6M13.5 10v6" />
  </Icon>
);

export const AlertIcon = (props: IconProps) => (
  <Icon {...props}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.8v4.7" />
    <circle cx="12" cy="15.9" r=".6" fill="currentColor" stroke="none" />
  </Icon>
);

/** Marks the in-room preview action. The one place a "magic" cue is warranted. */
export const PreviewIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M4 6.5A1.5 1.5 0 0 1 5.5 5h13A1.5 1.5 0 0 1 20 6.5v11a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5Z" />
    <path d="m8.6 9.4.9 2 2 .9-2 .9-.9 2-.9-2-2-.9 2-.9Z" />
    <path d="m15 13.2.55 1.25 1.25.55-1.25.55L15 16.8l-.55-1.25-1.25-.55 1.25-.55Z" />
  </Icon>
);

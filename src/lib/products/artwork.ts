import type { ProductCategory } from '@/types/domain';

/**
 * Product artwork.
 *
 * A production catalogue supplies cut-out photography from the retailer. Until
 * one is connected, artwork is generated here: parametric SVG, transparent
 * background, tuned so that a product composited into a real photograph reads
 * as a placed object rather than a sticker.
 *
 * That means three things matter more than detail — the silhouette, because it
 * is what the eye reads at a glance; the vertical shading, because a flat fill
 * looks pasted; and honest proportions, because scale is how the preview earns
 * trust. This is the seam a real catalogue replaces: change `Product.image.src`
 * to a retailer URL and nothing downstream cares.
 */

export interface ArtworkSpec {
  /** Primary material colour. */
  hex: string;
  /** Secondary colour: frame, pot, base, or trim. */
  accentHex?: string;
  /** Aspect ratio (w/h) the generator should use. */
  aspectRatio: number;
}

function svg(width: number, height: number, body: string): string {
  const markup = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">${body}</svg>`;
  // encodeURIComponent rather than base64: smaller, and readable in devtools.
  return `data:image/svg+xml,${encodeURIComponent(markup)}`;
}

/** Vertical soft-light gradient. The single most important trick here. */
function shading(id: string, direction: 'x' | 'y' = 'x'): string {
  const coords = direction === 'x' ? 'x1="0" y1="0" x2="1" y2="0"' : 'x1="0" y1="0" x2="0" y2="1"';
  return `<linearGradient id="${id}" ${coords}>
    <stop offset="0" stop-color="#000" stop-opacity="0.20"/>
    <stop offset="0.22" stop-color="#fff" stop-opacity="0.14"/>
    <stop offset="0.55" stop-color="#000" stop-opacity="0.06"/>
    <stop offset="0.8" stop-color="#fff" stop-opacity="0.10"/>
    <stop offset="1" stop-color="#000" stop-opacity="0.24"/>
  </linearGradient>`;
}

/**
 * Repeating vertical folds, for hanging fabric.
 *
 * `height` spans the full artwork so the pattern tiles horizontally only —
 * folds run the length of the drop, they do not repeat down it.
 */
function folds(id: string, step: number, height: number): string {
  return `<pattern id="${id}" width="${step}" height="${height}" patternUnits="userSpaceOnUse">
    <rect width="${step * 0.34}" height="${height}" fill="#000" opacity="0.09"/>
    <rect x="${step * 0.62}" width="${step * 0.16}" height="${height}" fill="#fff" opacity="0.10"/>
  </pattern>`;
}

/** Lightens (positive) or darkens (negative) a hex colour by a 0–1 amount. */
function shade(hex: string, amount: number): string {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match?.[1]) return hex;
  const value = Number.parseInt(match[1], 16);
  const channel = (shift: number) => {
    const base = (value >> shift) & 255;
    const next = amount >= 0 ? base + (255 - base) * amount : base * (1 + amount);
    return Math.max(0, Math.min(255, Math.round(next)));
  };
  return `#${[channel(16), channel(8), channel(0)]
    .map((c) => c.toString(16).padStart(2, '0'))
    .join('')}`;
}

/* -- Generators ------------------------------------------------------------ */

function curtains({ hex, aspectRatio }: ArtworkSpec): string {
  const w = 1000;
  const h = Math.round(w / aspectRatio);
  const panel = w * 0.27;
  return svg(
    w,
    h,
    `<defs>${shading('s')}${folds('f', 34, h)}</defs>
     <g>
       <rect x="0" y="${h * 0.045}" width="${panel}" height="${h * 0.955}" fill="${hex}" rx="4"/>
       <rect x="0" y="${h * 0.045}" width="${panel}" height="${h * 0.955}" fill="url(#f)" rx="4"/>
       <rect x="0" y="${h * 0.045}" width="${panel}" height="${h * 0.955}" fill="url(#s)" rx="4"/>
       <rect x="${w - panel}" y="${h * 0.045}" width="${panel}" height="${h * 0.955}" fill="${hex}" rx="4"/>
       <rect x="${w - panel}" y="${h * 0.045}" width="${panel}" height="${h * 0.955}" fill="url(#f)" rx="4"/>
       <rect x="${w - panel}" y="${h * 0.045}" width="${panel}" height="${h * 0.955}" fill="url(#s)" rx="4"/>
       <rect x="0" y="0" width="${w}" height="${h * 0.05}" rx="${h * 0.025}" fill="#8d8378"/>
       <rect x="0" y="0" width="${w}" height="${h * 0.022}" rx="${h * 0.011}" fill="#fff" opacity="0.25"/>
     </g>`,
  );
}

function blinds({ hex, aspectRatio }: ArtworkSpec): string {
  const w = 1000;
  const h = Math.round(w / aspectRatio);
  const slats = 16;
  const gap = (h * 0.72) / slats;
  const rows = Array.from({ length: slats }, (_, i) => {
    const y = h * 0.06 + i * gap;
    return `<rect x="${w * 0.02}" y="${y}" width="${w * 0.96}" height="${gap * 0.78}" rx="2" fill="${hex}"/>
            <rect x="${w * 0.02}" y="${y}" width="${w * 0.96}" height="${gap * 0.26}" rx="2" fill="#fff" opacity="0.16"/>`;
  }).join('');
  return svg(
    w,
    h,
    `<g>${rows}<rect x="${w * 0.02}" y="0" width="${w * 0.96}" height="${h * 0.05}" rx="3" fill="${hex}"/></g>`,
  );
}

function curtainRod({ hex, aspectRatio }: ArtworkSpec): string {
  const w = 1000;
  const h = Math.round(w / aspectRatio);
  return svg(
    w,
    h,
    `<g fill="${hex}">
       <rect x="${w * 0.06}" y="${h * 0.4}" width="${w * 0.88}" height="${h * 0.2}" rx="${h * 0.1}"/>
       <circle cx="${w * 0.05}" cy="${h * 0.5}" r="${h * 0.32}"/>
       <circle cx="${w * 0.95}" cy="${h * 0.5}" r="${h * 0.32}"/>
       <rect x="${w * 0.06}" y="${h * 0.4}" width="${w * 0.88}" height="${h * 0.07}" rx="${h * 0.035}" fill="#fff" opacity="0.3"/>
     </g>`,
  );
}

function rug({ hex, accentHex = '#ffffff', aspectRatio }: ArtworkSpec): string {
  const w = 1000;
  const h = Math.round(w / aspectRatio);
  return svg(
    w,
    h,
    `<defs>${shading('s', 'y')}</defs>
     <g>
       <rect width="${w}" height="${h}" rx="${h * 0.03}" fill="${hex}"/>
       <rect x="${w * 0.05}" y="${h * 0.09}" width="${w * 0.9}" height="${h * 0.82}" rx="${h * 0.02}" fill="none" stroke="${accentHex}" stroke-opacity="0.4" stroke-width="${h * 0.018}"/>
       <rect x="${w * 0.1}" y="${h * 0.18}" width="${w * 0.8}" height="${h * 0.64}" rx="${h * 0.02}" fill="${accentHex}" opacity="0.12"/>
       <rect width="${w}" height="${h}" rx="${h * 0.03}" fill="url(#s)"/>
     </g>`,
  );
}

function wallArt({ hex, accentHex = '#2c2924', aspectRatio }: ArtworkSpec): string {
  const w = 800;
  const h = Math.round(w / aspectRatio);
  const inset = w * 0.055;
  return svg(
    w,
    h,
    `<g>
       <rect width="${w}" height="${h}" rx="3" fill="${accentHex}"/>
       <rect x="${inset}" y="${inset}" width="${w - inset * 2}" height="${h - inset * 2}" fill="#f6f3ee"/>
       <rect x="${w * 0.16}" y="${h * 0.16}" width="${w * 0.68}" height="${h * 0.68}" fill="${hex}" opacity="0.9"/>
       <circle cx="${w * 0.42}" cy="${h * 0.44}" r="${w * 0.14}" fill="#fff" opacity="0.55"/>
       <rect x="${w * 0.16}" y="${h * 0.66}" width="${w * 0.68}" height="${h * 0.18}" fill="#000" opacity="0.14"/>
       <rect width="${w}" height="${h}" rx="3" fill="none" stroke="#000" stroke-opacity="0.25" stroke-width="2"/>
     </g>`,
  );
}

function mirror({ accentHex = '#b0a291', hex, aspectRatio }: ArtworkSpec): string {
  const w = 700;
  const h = Math.round(w / aspectRatio);
  const frame = accentHex;
  return svg(
    w,
    h,
    // Glass is opaque and pale rather than translucent: a mirror in a room
    // photograph reads as a bright plane with one sweeping highlight, and a
    // see-through fill would show the wall behind it and vanish.
    `<defs><linearGradient id="g" x1="0.1" y1="0" x2="0.9" y2="1">
       <stop offset="0" stop-color="${shade(hex, 0.42)}"/>
       <stop offset="0.44" stop-color="${shade(hex, 0.1)}"/>
       <stop offset="0.46" stop-color="#ffffff"/>
       <stop offset="0.52" stop-color="${shade(hex, 0.18)}"/>
       <stop offset="1" stop-color="${shade(hex, -0.14)}"/>
     </linearGradient></defs>
     <g>
       <ellipse cx="${w / 2}" cy="${h / 2}" rx="${w / 2 - 2}" ry="${h / 2 - 2}" fill="${frame}"/>
       <ellipse cx="${w / 2}" cy="${h / 2}" rx="${w / 2 - 2}" ry="${h / 2 - 2}" fill="url(#s)"/>
       <ellipse cx="${w / 2}" cy="${h / 2}" rx="${w * 0.43}" ry="${h * 0.43}" fill="url(#g)"/>
       <ellipse cx="${w / 2}" cy="${h / 2}" rx="${w * 0.43}" ry="${h * 0.43}" fill="none" stroke="#000" stroke-opacity="0.22"/>
     </g>
     <defs>${shading('s')}</defs>`,
  );
}

function shelving({ hex, aspectRatio }: ArtworkSpec): string {
  const w = 900;
  const h = Math.round(w / aspectRatio);
  const shelves = 3;
  const rows = Array.from({ length: shelves }, (_, i) => {
    const y = (h / shelves) * i + h * 0.06;
    return `<rect x="0" y="${y}" width="${w}" height="${h * 0.055}" rx="2" fill="${hex}"/>
            <rect x="0" y="${y}" width="${w}" height="${h * 0.018}" rx="2" fill="#fff" opacity="0.22"/>
            <rect x="${w * 0.06}" y="${y + h * 0.055}" width="${w * 0.02}" height="${h * 0.05}" fill="#000" opacity="0.3"/>
            <rect x="${w * 0.92}" y="${y + h * 0.055}" width="${w * 0.02}" height="${h * 0.05}" fill="#000" opacity="0.3"/>`;
  }).join('');
  return svg(w, h, `<g>${rows}</g>`);
}

function floorLamp({ hex, accentHex = '#f0e7d8', aspectRatio }: ArtworkSpec): string {
  const w = 400;
  const h = Math.round(w / aspectRatio);
  const cx = w / 2;
  return svg(
    w,
    h,
    `<defs>${shading('s')}</defs>
     <g>
       <path d="M${cx - w * 0.3} ${h * 0.2} L${cx + w * 0.3} ${h * 0.2} L${cx + w * 0.22} ${h * 0.03} L${cx - w * 0.22} ${h * 0.03} Z" fill="${accentHex}"/>
       <path d="M${cx - w * 0.3} ${h * 0.2} L${cx + w * 0.3} ${h * 0.2} L${cx + w * 0.22} ${h * 0.03} L${cx - w * 0.22} ${h * 0.03} Z" fill="url(#s)"/>
       <rect x="${cx - w * 0.022}" y="${h * 0.2}" width="${w * 0.044}" height="${h * 0.74}" fill="${hex}"/>
       <ellipse cx="${cx}" cy="${h * 0.96}" rx="${w * 0.19}" ry="${h * 0.022}" fill="${hex}"/>
     </g>`,
  );
}

function tableLamp({ hex, accentHex = '#f2ebdd', aspectRatio }: ArtworkSpec): string {
  const w = 400;
  const h = Math.round(w / aspectRatio);
  const cx = w / 2;
  return svg(
    w,
    h,
    `<defs>${shading('s')}</defs>
     <g>
       <path d="M${cx - w * 0.34} ${h * 0.5} L${cx + w * 0.34} ${h * 0.5} L${cx + w * 0.24} ${h * 0.08} L${cx - w * 0.24} ${h * 0.08} Z" fill="${accentHex}"/>
       <path d="M${cx - w * 0.34} ${h * 0.5} L${cx + w * 0.34} ${h * 0.5} L${cx + w * 0.24} ${h * 0.08} L${cx - w * 0.24} ${h * 0.08} Z" fill="url(#s)"/>
       <rect x="${cx - w * 0.03}" y="${h * 0.5}" width="${w * 0.06}" height="${h * 0.32}" fill="${hex}"/>
       <path d="M${cx - w * 0.2} ${h * 0.98} Q${cx} ${h * 0.72} ${cx + w * 0.2} ${h * 0.98} Z" fill="${hex}"/>
     </g>`,
  );
}

function pendant({ hex, aspectRatio }: ArtworkSpec): string {
  const w = 400;
  const h = Math.round(w / aspectRatio);
  const cx = w / 2;
  return svg(
    w,
    h,
    `<defs>${shading('s')}</defs>
     <g>
       <rect x="${cx - 2}" y="0" width="4" height="${h * 0.45}" fill="#3a3630"/>
       <path d="M${cx - w * 0.42} ${h * 0.95} Q${cx} ${h * 0.28} ${cx + w * 0.42} ${h * 0.95} Z" fill="${hex}"/>
       <path d="M${cx - w * 0.42} ${h * 0.95} Q${cx} ${h * 0.28} ${cx + w * 0.42} ${h * 0.95} Z" fill="url(#s)"/>
       <ellipse cx="${cx}" cy="${h * 0.95}" rx="${w * 0.42}" ry="${h * 0.045}" fill="#000" opacity="0.25"/>
     </g>`,
  );
}

function plant({ hex, accentHex = '#a9713f', aspectRatio }: ArtworkSpec): string {
  const w = 500;
  const h = Math.round(w / aspectRatio);
  const cx = w / 2;
  const soil = h * 0.62;

  /**
   * One leaf: a stem out to the tip, then a blade swept back along it. Drawn as
   * a closed shape rather than a stroke — at preview scale a stroked leaf
   * disappears into a line, which is what makes generated foliage look like
   * twigs.
   */
  const leaf = (dx: number, dy: number, width: number, tone: string) => {
    const tipX = cx + dx;
    const tipY = soil - dy;
    const midX = cx + dx * 0.45;
    const midY = soil - dy * 0.62;
    return `<path d="M${cx} ${soil}
      Q${midX - width} ${midY} ${tipX} ${tipY}
      Q${midX + width} ${midY + h * 0.02} ${cx} ${soil} Z" fill="${tone}"/>`;
  };

  const dark = shade(hex, -0.16);
  const light = shade(hex, 0.14);

  return svg(
    w,
    h,
    `<g>
       ${leaf(-w * 0.45, h * 0.2, w * 0.1, dark)}
       ${leaf(w * 0.47, h * 0.17, w * 0.1, dark)}
       ${leaf(-w * 0.33, h * 0.4, w * 0.12, hex)}
       ${leaf(w * 0.35, h * 0.37, w * 0.12, hex)}
       ${leaf(-w * 0.13, h * 0.55, w * 0.11, light)}
       ${leaf(w * 0.12, h * 0.57, w * 0.11, light)}
       ${leaf(w * 0.01, h * 0.62, w * 0.08, hex)}
       <path d="M${cx - w * 0.2} ${soil} L${cx + w * 0.2} ${soil} L${cx + w * 0.15} ${h * 0.995} L${cx - w * 0.15} ${h * 0.995} Z" fill="${accentHex}"/>
       <path d="M${cx - w * 0.2} ${soil} L${cx + w * 0.2} ${soil} L${cx + w * 0.15} ${h * 0.995} L${cx - w * 0.15} ${h * 0.995} Z" fill="url(#s)"/>
       <ellipse cx="${cx}" cy="${soil}" rx="${w * 0.2}" ry="${h * 0.03}" fill="#000" opacity="0.3"/>
     </g>
     <defs>${shading('s')}</defs>`,
  );
}

function planter({ hex, aspectRatio }: ArtworkSpec): string {
  const w = 400;
  const h = Math.round(w / aspectRatio);
  const cx = w / 2;
  return svg(
    w,
    h,
    `<defs>${shading('s')}</defs>
     <g>
       <path d="M${cx - w * 0.4} ${h * 0.06} L${cx + w * 0.4} ${h * 0.06} L${cx + w * 0.3} ${h * 0.98} L${cx - w * 0.3} ${h * 0.98} Z" fill="${hex}"/>
       <path d="M${cx - w * 0.4} ${h * 0.06} L${cx + w * 0.4} ${h * 0.06} L${cx + w * 0.3} ${h * 0.98} L${cx - w * 0.3} ${h * 0.98} Z" fill="url(#s)"/>
       <ellipse cx="${cx}" cy="${h * 0.07}" rx="${w * 0.4}" ry="${h * 0.05}" fill="#000" opacity="0.28"/>
     </g>`,
  );
}

function cushion({ hex, aspectRatio }: ArtworkSpec): string {
  const w = 500;
  const h = Math.round(w / aspectRatio);
  return svg(
    w,
    h,
    `<defs><radialGradient id="c" cx="0.42" cy="0.36" r="0.75">
       <stop offset="0" stop-color="#fff" stop-opacity="0.22"/>
       <stop offset="1" stop-color="#000" stop-opacity="0.20"/>
     </radialGradient></defs>
     <g>
       <path d="M${w * 0.06} ${h * 0.1} Q${w * 0.5} ${h * 0.02} ${w * 0.94} ${h * 0.1}
                Q${w * 1.0} ${h * 0.5} ${w * 0.94} ${h * 0.9}
                Q${w * 0.5} ${h * 0.98} ${w * 0.06} ${h * 0.9}
                Q${w * 0.0} ${h * 0.5} ${w * 0.06} ${h * 0.1} Z" fill="${hex}"/>
       <path d="M${w * 0.06} ${h * 0.1} Q${w * 0.5} ${h * 0.02} ${w * 0.94} ${h * 0.1}
                Q${w * 1.0} ${h * 0.5} ${w * 0.94} ${h * 0.9}
                Q${w * 0.5} ${h * 0.98} ${w * 0.06} ${h * 0.9}
                Q${w * 0.0} ${h * 0.5} ${w * 0.06} ${h * 0.1} Z" fill="url(#c)"/>
     </g>`,
  );
}

function throwBlanket({ hex, aspectRatio }: ArtworkSpec): string {
  const w = 600;
  const h = Math.round(w / aspectRatio);
  return svg(
    w,
    h,
    `<defs>${shading('s')}</defs>
     <g>
       <path d="M0 ${h * 0.12} Q${w * 0.3} 0 ${w * 0.62} ${h * 0.14}
                Q${w * 0.9} ${h * 0.28} ${w} ${h * 0.55}
                L${w * 0.86} ${h} L${w * 0.1} ${h * 0.94} Z" fill="${hex}"/>
       <path d="M0 ${h * 0.12} Q${w * 0.3} 0 ${w * 0.62} ${h * 0.14}
                Q${w * 0.9} ${h * 0.28} ${w} ${h * 0.55}
                L${w * 0.86} ${h} L${w * 0.1} ${h * 0.94} Z" fill="url(#s)"/>
       <path d="M${w * 0.08} ${h * 0.5} Q${w * 0.45} ${h * 0.4} ${w * 0.92} ${h * 0.62}" stroke="#000" stroke-opacity="0.12" fill="none" stroke-width="${h * 0.03}"/>
     </g>`,
  );
}

function sideTable({ hex, aspectRatio }: ArtworkSpec): string {
  const w = 400;
  const h = Math.round(w / aspectRatio);
  return svg(
    w,
    h,
    `<g fill="${hex}">
       <ellipse cx="${w / 2}" cy="${h * 0.14}" rx="${w * 0.46}" ry="${h * 0.1}"/>
       <rect x="${w * 0.04}" y="${h * 0.14}" width="${w * 0.92}" height="${h * 0.06}"/>
       <rect x="${w * 0.16}" y="${h * 0.2}" width="${w * 0.05}" height="${h * 0.78}" transform="rotate(4 ${w * 0.18} ${h * 0.6})"/>
       <rect x="${w * 0.79}" y="${h * 0.2}" width="${w * 0.05}" height="${h * 0.78}" transform="rotate(-4 ${w * 0.81} ${h * 0.6})"/>
       <rect x="${w * 0.47}" y="${h * 0.2}" width="${w * 0.05}" height="${h * 0.78}"/>
       <ellipse cx="${w / 2}" cy="${h * 0.14}" rx="${w * 0.46}" ry="${h * 0.1}" fill="#fff" opacity="0.12"/>
     </g>`,
  );
}

function mediaConsole({ hex, aspectRatio }: ArtworkSpec): string {
  const w = 900;
  const h = Math.round(w / aspectRatio);
  return svg(
    w,
    h,
    `<defs>${shading('s', 'y')}</defs>
     <g>
       <rect x="0" y="${h * 0.08}" width="${w}" height="${h * 0.72}" rx="4" fill="${hex}"/>
       <rect x="0" y="${h * 0.08}" width="${w}" height="${h * 0.72}" rx="4" fill="url(#s)"/>
       <rect x="${w * 0.04}" y="${h * 0.2}" width="${w * 0.44}" height="${h * 0.46}" rx="3" fill="#000" opacity="0.14"/>
       <rect x="${w * 0.52}" y="${h * 0.2}" width="${w * 0.44}" height="${h * 0.46}" rx="3" fill="#000" opacity="0.14"/>
       <rect x="${w * 0.08}" y="${h * 0.8}" width="${w * 0.04}" height="${h * 0.2}" fill="${hex}"/>
       <rect x="${w * 0.88}" y="${h * 0.8}" width="${w * 0.04}" height="${h * 0.2}" fill="${hex}"/>
     </g>`,
  );
}

function vase({ hex, aspectRatio }: ArtworkSpec): string {
  const w = 300;
  const h = Math.round(w / aspectRatio);
  const cx = w / 2;
  return svg(
    w,
    h,
    `<defs>${shading('s')}</defs>
     <g>
       <path d="M${cx - w * 0.16} ${h * 0.02} L${cx + w * 0.16} ${h * 0.02}
                Q${cx + w * 0.2} ${h * 0.3} ${cx + w * 0.36} ${h * 0.58}
                Q${cx + w * 0.4} ${h * 0.95} ${cx} ${h * 0.99}
                Q${cx - w * 0.4} ${h * 0.95} ${cx - w * 0.36} ${h * 0.58}
                Q${cx - w * 0.2} ${h * 0.3} ${cx - w * 0.16} ${h * 0.02} Z" fill="${hex}"/>
       <path d="M${cx - w * 0.16} ${h * 0.02} L${cx + w * 0.16} ${h * 0.02}
                Q${cx + w * 0.2} ${h * 0.3} ${cx + w * 0.36} ${h * 0.58}
                Q${cx + w * 0.4} ${h * 0.95} ${cx} ${h * 0.99}
                Q${cx - w * 0.4} ${h * 0.95} ${cx - w * 0.36} ${h * 0.58}
                Q${cx - w * 0.2} ${h * 0.3} ${cx - w * 0.16} ${h * 0.02} Z" fill="url(#s)"/>
     </g>`,
  );
}

function basket({ hex, aspectRatio }: ArtworkSpec): string {
  const w = 400;
  const h = Math.round(w / aspectRatio);
  const weave = Array.from({ length: 7 }, (_, i) => {
    const y = h * (0.16 + i * 0.115);
    return `<rect x="${w * 0.08}" y="${y}" width="${w * 0.84}" height="${h * 0.045}" fill="#000" opacity="0.08"/>`;
  }).join('');
  return svg(
    w,
    h,
    `<defs>${shading('s')}</defs>
     <g>
       <path d="M${w * 0.06} ${h * 0.1} L${w * 0.94} ${h * 0.1} L${w * 0.86} ${h * 0.98} L${w * 0.14} ${h * 0.98} Z" fill="${hex}"/>
       ${weave}
       <path d="M${w * 0.06} ${h * 0.1} L${w * 0.94} ${h * 0.1} L${w * 0.86} ${h * 0.98} L${w * 0.14} ${h * 0.98} Z" fill="url(#s)"/>
       <ellipse cx="${w / 2}" cy="${h * 0.1}" rx="${w * 0.44}" ry="${h * 0.055}" fill="#000" opacity="0.22"/>
     </g>`,
  );
}

function bedding({ hex, aspectRatio }: ArtworkSpec): string {
  const w = 900;
  const h = Math.round(w / aspectRatio);
  return svg(
    w,
    h,
    `<defs>${shading('s', 'y')}</defs>
     <g>
       <path d="M0 ${h * 0.22} Q${w * 0.5} ${h * 0.02} ${w} ${h * 0.22} L${w} ${h} L0 ${h} Z" fill="${hex}"/>
       <path d="M0 ${h * 0.22} Q${w * 0.5} ${h * 0.02} ${w} ${h * 0.22} L${w} ${h} L0 ${h} Z" fill="url(#s)"/>
       <path d="M0 ${h * 0.42} Q${w * 0.5} ${h * 0.26} ${w} ${h * 0.42}" stroke="#000" stroke-opacity="0.1" stroke-width="${h * 0.03}" fill="none"/>
     </g>`,
  );
}

type Generator = (spec: ArtworkSpec) => string;

const GENERATORS: Record<ProductCategory, Generator> = {
  curtains,
  blinds,
  curtain_rods: curtainRod,
  wall_art: wallArt,
  mirrors: mirror,
  shelving,
  rugs: rug,
  floor_lamps: floorLamp,
  table_lamps: tableLamp,
  pendant_lights: pendant,
  plants: plant,
  planters: planter,
  cushions: cushion,
  throws: throwBlanket,
  side_tables: sideTable,
  media_console: mediaConsole,
  bedding,
  headboards: bedding,
  baskets: basket,
  vases: vase,
};

/** Renders artwork for a category. Deterministic: same spec, same output. */
export function renderArtwork(category: ProductCategory, spec: ArtworkSpec): string {
  return GENERATORS[category](spec);
}

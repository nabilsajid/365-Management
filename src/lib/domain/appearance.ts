// The look an admin chooses for the whole company, and the colour shades
// worked out from one accent colour for light and dark mode.

export const ACCENT_PRESETS = [
  { value: '#b0643f', label: 'Clay' },
  { value: '#3b6ea8', label: 'Ocean' },
  { value: '#2f7f7a', label: 'Teal' },
  { value: '#3f7d58', label: 'Forest' },
  { value: '#7a4f8c', label: 'Plum' },
  { value: '#b0505f', label: 'Rose' },
  { value: '#a87522', label: 'Amber' },
  { value: '#4a4a4a', label: 'Graphite' },
] as const;

export const CORNERS = {
  sharp: { label: 'Sharp', card: '6px', control: '4px' },
  soft: { label: 'Soft', card: '14px', control: '10px' },
  round: { label: 'Round', card: '20px', control: '14px' },
} as const;
export type Corners = keyof typeof CORNERS;

export interface Appearance {
  accent?: string;
  corners?: Corners;
  glow?: boolean;
}

export const DEFAULT_APPEARANCE: Required<Appearance> = { accent: '#b0643f', corners: 'soft', glow: true };

const HEX = /^#[0-9a-f]{6}$/i;

/** Reads a stored value safely: anything unknown falls back to the default. */
export function readAppearance(value: unknown): Required<Appearance> {
  const raw = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  return {
    accent: typeof raw.accent === 'string' && HEX.test(raw.accent) ? raw.accent.toLowerCase() : DEFAULT_APPEARANCE.accent,
    corners: typeof raw.corners === 'string' && raw.corners in CORNERS ? (raw.corners as Corners) : DEFAULT_APPEARANCE.corners,
    glow: typeof raw.glow === 'boolean' ? raw.glow : DEFAULT_APPEARANCE.glow,
  };
}

type Rgb = [number, number, number];

const toRgb = (hex: string): Rgb => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as Rgb;
const toHex = (rgb: Rgb) => `#${rgb.map((part) => Math.round(Math.max(0, Math.min(255, part))).toString(16).padStart(2, '0')).join('')}`;
/** `amount` of the way from `from` to `to`. */
const mix = (from: Rgb, to: Rgb, amount: number): Rgb => from.map((part, i) => part + (to[i] - part) * amount) as Rgb;

function luminance([r, g, b]: Rgb): number {
  const channel = (value: number) => {
    const c = value / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrast(a: string, b: string): number {
  const [x, y] = [luminance(toRgb(a)), luminance(toRgb(b))].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

const WHITE: Rgb = [255, 255, 255];
const BLACK: Rgb = [0, 0, 0];
const DARK_TEXT = '#1a1614';

/** White or dark text, whichever reads better on the colour. */
const textOn = (hex: string) => (contrast(hex, '#ffffff') >= 4.5 ? '#ffffff' : DARK_TEXT);

export interface AccentShades {
  primary: string;
  hover: string;
  strong: string;
  soft: string;
  on: string;
}

/** The accent's shades for light mode and dark mode. Dark mode uses a lighter, softer version. */
export function accentShades(accent: string): { light: AccentShades; dark: AccentShades } {
  const base = toRgb(HEX.test(accent) ? accent : DEFAULT_APPEARANCE.accent);
  // In light mode, darken until white text reads well on it.
  let light = base;
  for (let step = 0; step < 10 && contrast(toHex(light), '#ffffff') < 4.5 && luminance(light) > 0.18; step += 1) {
    light = mix(light, BLACK, 0.08);
  }
  const lightHex = toHex(light);
  const darkHex = toHex(mix(base, WHITE, 0.3));
  return {
    light: {
      primary: lightHex,
      hover: toHex(mix(light, BLACK, 0.12)),
      strong: toHex(mix(light, BLACK, 0.22)),
      soft: toHex(mix(light, WHITE, 0.9)),
      on: textOn(lightHex),
    },
    dark: {
      primary: darkHex,
      hover: toHex(mix(base, WHITE, 0.42)),
      strong: toHex(mix(base, WHITE, 0.55)),
      soft: `${darkHex}24`,
      on: textOn(darkHex),
    },
  };
}

/** The style overrides for a company's look. Only checked values reach this, so it is safe to inline. */
export function appearanceCss(value: Appearance): string {
  const look = readAppearance(value);
  const { light, dark } = accentShades(look.accent);
  const corners = CORNERS[look.corners];
  const vars = (shades: AccentShades) =>
    `--color-primary:${shades.primary};--color-primary-hover:${shades.hover};--color-primary-strong:${shades.strong};--color-primary-soft:${shades.soft};--color-on-primary:${shades.on};`;
  return [
    `:root{${vars(light)}--accent-nav:${dark.primary};--glow-color:${look.accent};--radius-card:${corners.card};--radius-control:${corners.control};}`,
    `:root[data-theme='dark']{${vars(dark)}}`,
    look.glow ? '' : '.app-glow{display:none}',
  ].join('');
}

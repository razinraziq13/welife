/** Avatar colour palettes. Indexes match the ranges in engine APPEARANCE_LIMITS. */

export const SKIN_TONES = [
  '#fde7d6',
  '#f6d2b5',
  '#eebf98',
  '#dda47c',
  '#c88b62',
  '#ae724e',
  '#935f3e',
  '#7a4b30',
  '#5f3a25',
  '#46291a',
] as const;

export const HAIR_COLORS = [
  '#1c1a19',
  '#3a2a21',
  '#5a3b24',
  '#86592f',
  '#b48443',
  '#dbb46c',
  '#a8452b',
  '#6e2f1f',
] as const;

export const EYE_COLORS = [
  '#3b2414',
  '#6b4423',
  '#8e7240',
  '#4f7a4a',
  '#4a78a8',
  '#7b8794',
] as const;

export const SHIRT_COLORS = [
  '#5b7fb8',
  '#d9734e',
  '#4f9d8a',
  '#c45c8a',
  '#e0b84a',
  '#7d6bb3',
  '#4e8fc2',
  '#9a6b4f',
] as const;

export const HAIR_COLOR_NAMES = [
  'Black',
  'Dark brown',
  'Brown',
  'Light brown',
  'Dark blond',
  'Blond',
  'Red',
  'Auburn',
] as const;
export const EYE_COLOR_NAMES = ['Dark brown', 'Brown', 'Hazel', 'Green', 'Blue', 'Grey'] as const;
export const HAIR_STYLE_NAMES = [
  'Short crop',
  'Side part',
  'Short curls',
  'Long straight',
  'Bob',
  'Ponytail',
  'Volume',
  'Buzz cut',
] as const;
export const FACE_SHAPE_NAMES = ['Oval', 'Round', 'Long'] as const;

function parse(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function toHex([r, g, b]: [number, number, number]): string {
  return `#${[r, g, b]
    .map((c) =>
      Math.max(0, Math.min(255, Math.round(c)))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
}

/** Lightens (positive) or darkens (negative) a colour by a percentage. */
export function shade(hex: string, percent: number): string {
  const [r, g, b] = parse(hex);
  const f = percent / 100;
  return f >= 0
    ? toHex([r + (255 - r) * f, g + (255 - g) * f, b + (255 - b) * f])
    : toHex([r * (1 + f), g * (1 + f), b * (1 + f)]);
}

function mix(a: string, b: string, amount: number): string {
  const [r1, g1, b1] = parse(a);
  const [r2, g2, b2] = parse(b);
  return toHex([r1 + (r2 - r1) * amount, g1 + (g2 - g1) * amount, b1 + (b2 - b1) * amount]);
}

/** Hair greys progressively with age. */
export function greyHair(hex: string, ageYears: number): string {
  if (ageYears < 45) return hex;
  const amount = ageYears < 55 ? 0.2 : ageYears < 65 ? 0.45 : ageYears < 75 ? 0.7 : 0.88;
  return mix(hex, '#d9d9d9', amount);
}

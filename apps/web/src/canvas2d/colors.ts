/** Small colour helpers used by the 2D renderer; the 3D scene uses three.js colours instead. */

function clampChannel(value: number): number {
  return Math.min(255, Math.max(0, Math.round(value)));
}

export function parseHex(hex: string): { r: number; g: number; b: number } {
  const normalized = hex.replace('#', '');
  const full =
    normalized.length === 3
      ? normalized
          .split('')
          .map((char) => char + char)
          .join('')
      : normalized;

  return {
    r: Number.parseInt(full.slice(0, 2), 16) || 0,
    g: Number.parseInt(full.slice(2, 4), 16) || 0,
    b: Number.parseInt(full.slice(4, 6), 16) || 0,
  };
}

export function toHex({ r, g, b }: { r: number; g: number; b: number }): string {
  const part = (value: number): string => clampChannel(value).toString(16).padStart(2, '0');
  return `#${part(r)}${part(g)}${part(b)}`;
}

/** `amount` in `[-1, 1]`: negative darkens, positive lightens. */
export function shade(hex: string, amount: number): string {
  const { r, g, b } = parseHex(hex);
  const target = amount >= 0 ? 255 : 0;
  const ratio = Math.abs(amount);

  return toHex({
    r: r + (target - r) * ratio,
    g: g + (target - g) * ratio,
    b: b + (target - b) * ratio,
  });
}

export function withAlpha(hex: string, alpha: number): string {
  const { r, g, b } = parseHex(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Editor palette for the plan canvas. These mirror the CSS tokens in `index.css` but live in
 * JS because the canvas cannot read Tailwind classes, and the PNG export must produce the same
 * colours outside the DOM.
 */
export const PLAN_COLORS = {
  background: '#0a1020',
  backgroundLight: '#f6f7fa',
  gridMinor: 'rgba(148, 170, 205, 0.08)',
  gridMajor: 'rgba(148, 170, 205, 0.16)',
  axis: 'rgba(96, 141, 220, 0.35)',

  wallFill: '#d6ddeb',
  wallStroke: '#8ea0c0',
  wallFillLight: '#2c3545',

  roomFill: 'rgba(125, 155, 210, 0.07)',
  roomStroke: 'rgba(125, 155, 210, 0.14)',
  roomLabel: '#c3d1e8',
  roomArea: '#7d8ca8',

  opening: '#0a1020',
  openingStroke: '#5f7290',
  glass: '#6fb4e8',

  furnitureStroke: 'rgba(10, 16, 32, 0.55)',

  accent: '#3b76ff',
  accentSoft: 'rgba(59, 118, 255, 0.18)',
  selection: '#4d8cff',
  hover: 'rgba(120, 165, 255, 0.5)',

  dimension: '#8fa2c2',
  dimensionBackground: 'rgba(10, 16, 32, 0.82)',

  measure: '#f5b544',
  danger: '#f05454',
  node: '#7fa8ff',
} as const;

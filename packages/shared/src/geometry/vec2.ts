import type { Vec2 } from '../domain/types';

export const EPSILON = 1e-9;

export const vec = (x: number, y: number): Vec2 => ({ x, y });

export const add = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, y: a.y + b.y });

export const sub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y });

export const scale = (a: Vec2, k: number): Vec2 => ({ x: a.x * k, y: a.y * k });

export const dot = (a: Vec2, b: Vec2): number => a.x * b.x + a.y * b.y;

/** 2D cross product (z component of the 3D cross product). */
export const cross = (a: Vec2, b: Vec2): number => a.x * b.y - a.y * b.x;

export const lengthSq = (a: Vec2): number => a.x * a.x + a.y * a.y;

export const length = (a: Vec2): number => Math.sqrt(lengthSq(a));

export const distance = (a: Vec2, b: Vec2): number => length(sub(a, b));

export const distanceSq = (a: Vec2, b: Vec2): number => lengthSq(sub(a, b));

export function normalize(a: Vec2): Vec2 {
  const len = length(a);
  return len < EPSILON ? { x: 0, y: 0 } : { x: a.x / len, y: a.y / len };
}

/** Rotates 90° counter-clockwise in math coordinates (to the left of the direction of travel). */
export const perpendicular = (a: Vec2): Vec2 => ({ x: -a.y, y: a.x });

export const lerp = (a: Vec2, b: Vec2, t: number): Vec2 => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
});

export function rotate(a: Vec2, radians: number, origin: Vec2 = { x: 0, y: 0 }): Vec2 {
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const dx = a.x - origin.x;
  const dy = a.y - origin.y;
  return {
    x: origin.x + dx * cos - dy * sin,
    y: origin.y + dx * sin + dy * cos,
  };
}

/** Angle of the vector in radians, measured with `atan2(y, x)`. */
export const angleOf = (a: Vec2): number => Math.atan2(a.y, a.x);

export const equals = (a: Vec2, b: Vec2, tolerance = 1e-6): boolean =>
  Math.abs(a.x - b.x) <= tolerance && Math.abs(a.y - b.y) <= tolerance;

/** Normalizes any angle into `[0, 2π)`. */
export function normalizeAngle(radians: number): number {
  const twoPi = Math.PI * 2;
  const value = radians % twoPi;
  return value < 0 ? value + twoPi : value;
}

export const roundTo = (value: number, decimals = 4): number => {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
};

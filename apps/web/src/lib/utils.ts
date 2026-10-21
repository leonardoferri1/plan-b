import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/** Clamps a number into an inclusive range. */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Trailing-edge debounce that also exposes `flush` and `cancel`. */
export function debounce<Args extends unknown[]>(
  fn: (...args: Args) => void,
  delay: number,
): { (...args: Args): void; flush(): void; cancel(): void } {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: Args | null = null;

  const invoke = (): void => {
    if (!pending) return;
    const args = pending;
    pending = null;
    timer = null;
    fn(...args);
  };

  const debounced = (...args: Args): void => {
    pending = args;
    if (timer) clearTimeout(timer);
    timer = setTimeout(invoke, delay);
  };

  debounced.flush = (): void => {
    if (timer) clearTimeout(timer);
    invoke();
  };

  debounced.cancel = (): void => {
    if (timer) clearTimeout(timer);
    timer = null;
    pending = null;
  };

  return debounced;
}

export const isMac = (): boolean =>
  typeof navigator !== 'undefined' && /mac|iphone|ipad/i.test(navigator.userAgent ?? '');

/** Renders a shortcut the way the current platform writes it. */
export function formatShortcut(shortcut: string): string {
  return isMac() ? shortcut.replace(/Ctrl/g, 'Cmd').replace(/Alt/g, 'Opt') : shortcut;
}

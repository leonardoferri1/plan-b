const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';

function randomSuffix(length: number): string {
  const globalCrypto = (
    globalThis as { crypto?: { getRandomValues?<T extends Uint8Array>(array: T): T } }
  ).crypto;

  if (globalCrypto?.getRandomValues) {
    const bytes = new Uint8Array(length);
    globalCrypto.getRandomValues(bytes);
    let out = '';
    for (const byte of bytes) {
      out += ALPHABET[byte % ALPHABET.length];
    }
    return out;
  }

  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return out;
}

/**
 * Short, prefixed, collision-resistant id (`wall_m2k9x1q4`).
 *
 * The prefix makes debugging a serialized plan dramatically easier — you can tell what an id
 * points at without a lookup — and keeps ids stable across save/load cycles.
 */
export function createId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${randomSuffix(6)}`;
}

export const newNodeId = (): string => createId('nd');
export const newWallId = (): string => createId('wl');
export const newOpeningId = (): string => createId('op');
export const newRoomId = (): string => createId('rm');
export const newFurnitureId = (): string => createId('fn');
export const newLevelId = (): string => createId('lv');
export const newProjectId = (): string => createId('pr');

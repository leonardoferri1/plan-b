/** Copy legacy browser data once, retaining the original if storage is unavailable. */
export function readStoredValue(key: string): string | null {
  const current = localStorage.getItem(key);
  if (current !== null) return current;

  const legacyKey = key.replace(/^plan-b:/, 'spacecraft:');
  const legacy = localStorage.getItem(legacyKey);
  if (legacy !== null) {
    try {
      localStorage.setItem(key, legacy);
      localStorage.removeItem(legacyKey);
    } catch {
      // Continue using the existing data even when storage is full or read-only.
    }
  }
  return legacy;
}

import { readStoredValue } from './storage';

const WORKSPACE_KEY = 'plan-b:workspace-id';
const LAST_PROJECT_KEY = 'plan-b:last-project-id';

export const WORKSPACE_HEADER = 'x-workspace-id';

function randomId(): string {
  const bytes = new Uint8Array(8);

  if (typeof crypto !== 'undefined' && 'getRandomValues' in crypto) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  }

  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * The anonymous demo workspace this browser belongs to.
 *
 * There is no account system in the MVP, so the browser mints an opaque id once and keeps it
 * in localStorage. It scopes server-side reads and writes; anybody holding the id can read
 * them, which is why the UI labels server-backed demo projects as disposable.
 */
export function getWorkspaceId(): string {
  try {
    const existing = readStoredValue(WORKSPACE_KEY);
    if (existing) return existing;

    const created = `ws-${randomId()}`;
    localStorage.setItem(WORKSPACE_KEY, created);
    return created;
  } catch {
    // Private mode with storage disabled: a per-session id still lets the API scope requests.
    return `ws-${randomId()}`;
  }
}

export function getLastProjectId(): string | null {
  try {
    return readStoredValue(LAST_PROJECT_KEY);
  } catch {
    return null;
  }
}

export function setLastProjectId(id: string | null): void {
  try {
    localStorage.removeItem('spacecraft:last-project-id');
    if (id) localStorage.setItem(LAST_PROJECT_KEY, id);
    else localStorage.removeItem(LAST_PROJECT_KEY);
  } catch {
    /* storage unavailable: the editor still works, it just will not reopen the last project */
  }
}

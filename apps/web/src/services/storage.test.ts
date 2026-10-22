import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readStoredValue } from './storage';
import { getLastProjectId, getWorkspaceId, setLastProjectId } from './workspace';

describe('renamed browser storage', () => {
  beforeEach(() => {
    const values = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: vi.fn((key: string, value: string) => values.set(key, value)),
      removeItem: (key: string) => values.delete(key),
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('preserves existing projects and migrates their storage key', () => {
    localStorage.setItem('spacecraft:projects:v1', '{"saved":{}}');
    expect(readStoredValue('plan-b:projects:v1')).toBe('{"saved":{}}');
    expect(localStorage.getItem('plan-b:projects:v1')).toBe('{"saved":{}}');
    expect(localStorage.getItem('spacecraft:projects:v1')).toBeNull();
  });

  it('keeps the workspace identity and last opened project', () => {
    localStorage.setItem('spacecraft:workspace-id', 'ws-existing');
    localStorage.setItem('spacecraft:last-project-id', 'existing');
    expect(getWorkspaceId()).toBe('ws-existing');
    expect(getLastProjectId()).toBe('existing');
    setLastProjectId(null);
    expect(getLastProjectId()).toBeNull();
  });

  it('prefers current data over old data', () => {
    localStorage.setItem('spacecraft:projects:v1', 'old');
    localStorage.setItem('plan-b:projects:v1', 'current');
    expect(readStoredValue('plan-b:projects:v1')).toBe('current');
  });

  it('still reads old data when migration cannot be written', () => {
    localStorage.setItem('spacecraft:projects:v1', 'saved');
    vi.mocked(localStorage.setItem).mockImplementation(() => {
      throw new Error('Storage full');
    });
    expect(readStoredValue('plan-b:projects:v1')).toBe('saved');
    expect(localStorage.getItem('spacecraft:projects:v1')).toBe('saved');
  });
});

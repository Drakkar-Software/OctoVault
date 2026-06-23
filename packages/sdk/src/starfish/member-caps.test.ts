/**
 * Tests for the member-caps compat shim. Most of this module re-exports starfish-spaces
 * directly — we only test the local shim `getMemberCap` that isn't in the SDK.
 *
 * Note: member-caps.ts moved its source from octospaces-sdk to starfish-spaces in the
 * octospaces-sdk 0.23+ migration — mock the correct module.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@drakkar.software/starfish-spaces', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@drakkar.software/starfish-spaces')>();
  return { ...actual, getSpaceAccessEntry: vi.fn() };
});

import { getSpaceAccessEntry } from '@drakkar.software/starfish-spaces';
import { getMemberCap } from './member-caps';

beforeEach(() => vi.clearAllMocks());

describe('getMemberCap', () => {
  it('returns the cap string for a member-kind entry', () => {
    vi.mocked(getSpaceAccessEntry).mockReturnValue({ kind: 'member', cap: '{"kind":"member"}' } as never);
    expect(getMemberCap('sp-abc')).toBe('{"kind":"member"}');
    expect(getSpaceAccessEntry).toHaveBeenCalledWith('sp-abc');
  });

  it('returns null when the entry is a link-kind (not member)', () => {
    vi.mocked(getSpaceAccessEntry).mockReturnValue({ kind: 'link', linkAccess: {} } as never);
    expect(getMemberCap('sp-abc')).toBeNull();
  });

  it('returns null when no entry exists for the space', () => {
    vi.mocked(getSpaceAccessEntry).mockReturnValue(undefined);
    expect(getMemberCap('sp-abc')).toBeNull();
  });
});

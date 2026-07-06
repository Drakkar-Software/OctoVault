/**
 * Tests for mutes.ts — the thin wrapper mutes.ts builds over starfish-spaces'
 * generic `createPrefsStore`, since dk-spaces-sdk 0.31 dropped `createMutesStore`.
 * `createPrefsStore` itself is mocked (it's starfish-spaces' own, already-tested
 * machinery); these tests pin the wrapper's derived getters and mutate callbacks.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MutePrefs, Session } from '@drakkar.software/starfish-spaces';

const { fakeStore } = vi.hoisted(() => {
  const fakeStore = {
    get: vi.fn(() => ({ nodes: {}, spaces: {} }) as MutePrefs),
    subscribe: vi.fn(() => () => {}),
    loadFromKv: vi.fn(async () => ({ nodes: {}, spaces: {} }) as MutePrefs),
    hydrate: vi.fn(async () => {}),
    reset: vi.fn(),
    mutate: vi.fn(async () => {}),
  };
  return { fakeStore };
});

vi.mock('@drakkar.software/starfish-spaces', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@drakkar.software/starfish-spaces')>();
  return { ...actual, createPrefsStore: vi.fn(() => fakeStore) };
});

import {
  getMutePrefs,
  isRoomMuted,
  isSpaceMuted,
  isMuted,
  subscribeMutes,
  hydrateMutes,
  resetMutes,
  loadMutesFromKv,
  setRoomMute,
  setSpaceMute,
} from './mutes';

const FAKE_SESSION = {} as Session;

beforeEach(() => {
  vi.clearAllMocks();
  fakeStore.get.mockReturnValue({ nodes: {}, spaces: {} });
});

describe('getMutePrefs / isRoomMuted / isSpaceMuted / isMuted', () => {
  it('reads through to the store', () => {
    fakeStore.get.mockReturnValue({ nodes: { r1: true }, spaces: {} });
    expect(getMutePrefs()).toEqual({ nodes: { r1: true }, spaces: {} });
    expect(isRoomMuted('r1')).toBe(true);
    expect(isRoomMuted('r2')).toBe(false);
  });

  it('isSpaceMuted checks the spaces map', () => {
    fakeStore.get.mockReturnValue({ nodes: {}, spaces: { s1: true } });
    expect(isSpaceMuted('s1')).toBe(true);
    expect(isSpaceMuted('s2')).toBe(false);
  });

  it('a future epoch-ms mute is active; a past one is not', () => {
    const future = Date.now() + 60_000;
    const past = Date.now() - 60_000;
    fakeStore.get.mockReturnValue({ nodes: { r1: future, r2: past }, spaces: {} });
    expect(isRoomMuted('r1')).toBe(true);
    expect(isRoomMuted('r2')).toBe(false);
  });

  it('isMuted is true if either the room or its space is muted', () => {
    fakeStore.get.mockReturnValue({ nodes: { r1: true }, spaces: {} });
    expect(isMuted('r1', 's1')).toBe(true);
    fakeStore.get.mockReturnValue({ nodes: {}, spaces: { s1: true } });
    expect(isMuted('r1', 's1')).toBe(true);
    fakeStore.get.mockReturnValue({ nodes: {}, spaces: {} });
    expect(isMuted('r1', 's1')).toBe(false);
  });
});

describe('subscribeMutes / hydrateMutes / resetMutes / loadMutesFromKv', () => {
  it('subscribeMutes delegates to the store', () => {
    const listener = () => {};
    subscribeMutes(listener);
    expect(fakeStore.subscribe).toHaveBeenCalledWith(listener);
  });

  it('hydrateMutes delegates (userId, serverPrefs)', () => {
    const prefs: MutePrefs = { nodes: { r1: true }, spaces: {} };
    hydrateMutes('u1', prefs);
    expect(fakeStore.hydrate).toHaveBeenCalledWith('u1', prefs);
  });

  it('resetMutes delegates', () => {
    resetMutes();
    expect(fakeStore.reset).toHaveBeenCalledOnce();
  });

  it('loadMutesFromKv delegates (userId)', () => {
    loadMutesFromKv('u1');
    expect(fakeStore.loadFromKv).toHaveBeenCalledWith('u1');
  });
});

describe('setRoomMute / setSpaceMute', () => {
  it('setRoomMute mutates the nodes map via applyMute', () => {
    setRoomMute(FAKE_SESSION, 'r1', true);
    expect(fakeStore.mutate).toHaveBeenCalledWith(FAKE_SESSION, expect.any(Function));
    const apply = fakeStore.mutate.mock.calls[0]![1] as (cur: MutePrefs) => MutePrefs | null;
    const result = apply({ nodes: {}, spaces: {} });
    expect(result?.nodes.r1).toBe(true);
  });

  it('setSpaceMute mutates the spaces map via applyMute', () => {
    setSpaceMute(FAKE_SESSION, 's1', true);
    const apply = fakeStore.mutate.mock.calls[0]![1] as (cur: MutePrefs) => MutePrefs | null;
    const result = apply({ nodes: {}, spaces: {} });
    expect(result?.spaces.s1).toBe(true);
  });

  it('unmuting (muted: false) clears the entry rather than setting false', () => {
    setRoomMute(FAKE_SESSION, 'r1', false);
    const apply = fakeStore.mutate.mock.calls[0]![1] as (cur: MutePrefs) => MutePrefs | null;
    const result = apply({ nodes: { r1: true }, spaces: {} });
    expect(result?.nodes.r1).toBeUndefined();
  });
});

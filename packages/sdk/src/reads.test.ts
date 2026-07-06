/**
 * Tests for reads.ts — the thin wrapper reads.ts builds over starfish-spaces'
 * generic `createPrefsStore`, since dk-spaces-sdk 0.31 dropped `createReadsStore`.
 * `createPrefsStore` itself is mocked (it's starfish-spaces' own, already-tested
 * machinery); these tests pin the wrapper's derived getters and mutate callback.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReadPrefs, Session } from '@drakkar.software/starfish-spaces';

const { fakeStore } = vi.hoisted(() => {
  const fakeStore = {
    get: vi.fn(() => ({ nodes: {} }) as ReadPrefs),
    subscribe: vi.fn(() => () => {}),
    loadFromKv: vi.fn(async () => ({ nodes: {} }) as ReadPrefs),
    hydrate: vi.fn(async () => {}),
    reset: vi.fn(),
    mutate: vi.fn(async () => {}),
    flushNow: vi.fn(async () => {}),
  };
  return { fakeStore };
});

vi.mock('@drakkar.software/starfish-spaces', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@drakkar.software/starfish-spaces')>();
  return { ...actual, createPrefsStore: vi.fn(() => fakeStore) };
});

import {
  getReadPrefs,
  getRoomReadAt,
  subscribeReads,
  loadReadMarksFromKv,
  hydrateReads,
  resetReads,
  flushReadsNow,
  setRoomReadAt,
} from './reads';

const FAKE_SESSION = {} as Session;

beforeEach(() => {
  vi.clearAllMocks();
  fakeStore.get.mockReturnValue({ nodes: {} });
});

describe('getReadPrefs / getRoomReadAt', () => {
  it('reads through to the store', () => {
    fakeStore.get.mockReturnValue({ nodes: { r1: 100 } });
    expect(getReadPrefs()).toEqual({ nodes: { r1: 100 } });
    expect(getRoomReadAt('r1')).toBe(100);
    expect(getRoomReadAt('r2')).toBeUndefined();
  });
});

describe('subscribeReads / hydrateReads / resetReads / loadReadMarksFromKv / flushReadsNow', () => {
  it('subscribeReads delegates to the store', () => {
    const listener = () => {};
    subscribeReads(listener);
    expect(fakeStore.subscribe).toHaveBeenCalledWith(listener);
  });

  it('hydrateReads delegates (userId, serverPrefs)', () => {
    const prefs: ReadPrefs = { nodes: { r1: 100 } };
    hydrateReads('u1', prefs);
    expect(fakeStore.hydrate).toHaveBeenCalledWith('u1', prefs);
  });

  it('resetReads delegates', () => {
    resetReads();
    expect(fakeStore.reset).toHaveBeenCalledOnce();
  });

  it('loadReadMarksFromKv delegates (userId)', () => {
    loadReadMarksFromKv('u1');
    expect(fakeStore.loadFromKv).toHaveBeenCalledWith('u1');
  });

  it('flushReadsNow delegates', () => {
    flushReadsNow();
    expect(fakeStore.flushNow).toHaveBeenCalledOnce();
  });
});

describe('setRoomReadAt', () => {
  it('advances the read mark when the new ts is newer (monotonic max-merge)', () => {
    setRoomReadAt(FAKE_SESSION, 'r1', 200);
    expect(fakeStore.mutate).toHaveBeenCalledWith(FAKE_SESSION, expect.any(Function));
    const apply = fakeStore.mutate.mock.calls[0]![1] as (cur: ReadPrefs) => ReadPrefs | null;
    expect(apply({ nodes: { r1: 100 } })?.nodes.r1).toBe(200);
  });

  it('is a no-op (returns null) when the new ts is not newer', () => {
    setRoomReadAt(FAKE_SESSION, 'r1', 50);
    const apply = fakeStore.mutate.mock.calls[0]![1] as (cur: ReadPrefs) => ReadPrefs | null;
    expect(apply({ nodes: { r1: 100 } })).toBeNull();
  });

  it('treats an absent room as read-at-0, so any positive ts advances it', () => {
    setRoomReadAt(FAKE_SESSION, 'r1', 1);
    const apply = fakeStore.mutate.mock.calls[0]![1] as (cur: ReadPrefs) => ReadPrefs | null;
    expect(apply({ nodes: {} })?.nodes.r1).toBe(1);
  });
});

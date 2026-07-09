import { beforeEach, describe, expect, it, vi } from 'vitest';

import { configureKv } from '../config/kv';
import {
  clearWalCache,
  createCachingWalSnapshotStore,
  createCachingWalTransport,
  flushWalOutbox,
  readWalOutbox,
} from './wal-cache';
import type { WalAppendElement, WalTransport } from '@drakkar.software/starfish-wal';

// dk-spaces-sdk's `configureKv` reaches into starfish-spaces at import time; the
// unit under test only needs the three kv shims, so stub the forwarding module.
vi.mock('@drakkar.software/dk-spaces-sdk', () => ({ configureKv: () => {} }));

const DOC = 'spaces/sp1/objects/pages/pg1';

const store = new Map<string, string>();
const netErr = () => new Error('Failed to fetch');

function el(ts: number, seq = ts): WalAppendElement {
  return { ts, data: { sealed: seq }, authorPubkey: 'ed-pub', authorSignature: `sig-${seq}` };
}

beforeEach(() => {
  store.clear();
  configureKv({
    async get(k) {
      return store.get(k) ?? null;
    },
    async set(k, v) {
      store.set(k, v);
    },
    async remove(k) {
      store.delete(k);
    },
  });
});

describe('createCachingWalTransport — reads', () => {
  it('mirrors pulled elements and replays them when the network is down', async () => {
    const inner: WalTransport = {
      pull: vi.fn().mockResolvedValueOnce([el(10), el(20)]).mockRejectedValueOnce(netErr()),
      append: vi.fn(),
    };
    const transport = createCachingWalTransport(inner);

    await expect(transport.pull(DOC, 0)).resolves.toEqual([el(10), el(20)]);
    // Same cold start, now offline: the cached log stands in for the server.
    await expect(transport.pull(DOC, 0)).resolves.toEqual([el(10), el(20)]);
  });

  it('serves only the elements after the checkpoint when offline', async () => {
    const inner: WalTransport = {
      pull: vi.fn().mockResolvedValueOnce([el(10), el(20), el(30)]).mockRejectedValue(netErr()),
      append: vi.fn(),
    };
    const transport = createCachingWalTransport(inner);

    await transport.pull(DOC, 0);
    await expect(transport.pull(DOC, 20)).resolves.toEqual([el(30)]);
  });

  it('rethrows a non-network failure rather than hiding it behind the cache', async () => {
    const denied = Object.assign(new Error('forbidden'), { status: 403 });
    const inner: WalTransport = { pull: vi.fn().mockRejectedValue(denied), append: vi.fn() };

    await expect(createCachingWalTransport(inner).pull(DOC, 0)).rejects.toBe(denied);
  });

  it('reports reachability from the real outcome of each pull', async () => {
    const onReachable = vi.fn();
    const inner: WalTransport = {
      pull: vi.fn().mockResolvedValueOnce([el(10)]).mockRejectedValueOnce(netErr()),
      append: vi.fn(),
    };
    const transport = createCachingWalTransport(inner, onReachable);

    await transport.pull(DOC, 0);
    await transport.pull(DOC, 0);
    expect(onReachable.mock.calls).toEqual([[true], [false]]);
  });
});

describe('createCachingWalTransport — writes', () => {
  const body = { data: { sealed: 1 }, authorPubkey: 'ed-pub', authorSignature: 'sig-1' };

  it('parks a commit in the outbox on a network failure and reports success', async () => {
    const inner: WalTransport = { pull: vi.fn(), append: vi.fn().mockRejectedValue(netErr()) };

    // Resolving is load-bearing: `WalDocument.commit()` only clears its pending
    // ops when append resolves, and the outbox now owns their durability.
    await expect(createCachingWalTransport(inner).append(DOC, body)).resolves.toEqual({ ts: 0 });
    await expect(readWalOutbox(DOC)).resolves.toEqual([body]);
  });

  it('rethrows a rejected commit instead of parking it', async () => {
    const denied = Object.assign(new Error('revoked'), { status: 403 });
    const inner: WalTransport = { pull: vi.fn(), append: vi.fn().mockRejectedValue(denied) };

    await expect(createCachingWalTransport(inner).append(DOC, body)).rejects.toBe(denied);
    await expect(readWalOutbox(DOC)).resolves.toEqual([]);
  });

  it('keeps offline edits visible by replaying the outbox at the checkpoint', async () => {
    const inner: WalTransport = {
      pull: vi.fn().mockResolvedValue([]),
      append: vi.fn().mockRejectedValue(netErr()),
    };
    const transport = createCachingWalTransport(inner);
    await transport.append(DOC, body);

    // `ts === checkpoint` so the fold happens but the checkpoint cannot advance
    // past a real element the server still owes us.
    await expect(transport.pull(DOC, 42)).resolves.toEqual([{ ts: 42, ...body }]);
  });
});

describe('flushWalOutbox', () => {
  const bodies = [0, 1, 2].map((i) => ({
    data: { sealed: i },
    authorPubkey: 'ed-pub',
    authorSignature: `sig-${i}`,
  }));

  async function park(inner: WalTransport) {
    const t = createCachingWalTransport({ ...inner, append: vi.fn().mockRejectedValue(netErr()) });
    for (const b of bodies) await t.append(DOC, b);
  }

  it('drains every entry in order and clears the queue', async () => {
    const append = vi.fn(async () => ({ ts: 1 }));
    await park({ pull: vi.fn(), append: vi.fn() });

    await expect(flushWalOutbox(DOC, { pull: vi.fn(), append })).resolves.toBe(3);
    expect(append.mock.calls.map(([, b]) => b)).toEqual(bodies);
    await expect(readWalOutbox(DOC)).resolves.toEqual([]);
  });

  it('stops at the first network failure and keeps the rest queued in order', async () => {
    const append = vi
      .fn()
      .mockResolvedValueOnce({ ts: 1 })
      .mockRejectedValue(netErr());
    await park({ pull: vi.fn(), append: vi.fn() });

    await expect(flushWalOutbox(DOC, { pull: vi.fn(), append })).resolves.toBe(1);
    // The sequence inside each envelope is contiguous — a gap would trip the
    // reader's truncation check, so a failed entry must block the ones behind it.
    await expect(readWalOutbox(DOC)).resolves.toEqual([bodies[1], bodies[2]]);
  });

  it('drops a permanently-rejected entry so it cannot wedge the queue', async () => {
    const append = vi
      .fn()
      .mockResolvedValueOnce({ ts: 1 })
      .mockRejectedValueOnce(Object.assign(new Error('revoked'), { status: 403 }));
    await park({ pull: vi.fn(), append: vi.fn() });

    await flushWalOutbox(DOC, { pull: vi.fn(), append });
    await expect(readWalOutbox(DOC)).resolves.toEqual([bodies[2]]);
  });

  it('is a no-op on an empty outbox', async () => {
    const append = vi.fn();
    await expect(flushWalOutbox(DOC, { pull: vi.fn(), append })).resolves.toBe(0);
    expect(append).not.toHaveBeenCalled();
  });

  it('survives a restart: a parked commit is still there for a fresh transport', async () => {
    await park({ pull: vi.fn(), append: vi.fn() });
    // Nothing in memory carries over — only the KV store does.
    await expect(readWalOutbox(DOC)).resolves.toEqual(bodies);
  });
});

describe('createCachingWalSnapshotStore', () => {
  const snap = {
    state: { sealed: 1 },
    uptoTs: 20,
    writerSeq: { 'ed-pub': 2 },
    producedBy: 'ed-pub',
    authorPubkey: 'ed-pub',
    authorSignature: 'sig',
  };

  it('falls back to the cached snapshot so a cold start offline still opens', async () => {
    const inner = { read: vi.fn().mockResolvedValueOnce(snap).mockRejectedValueOnce(netErr()), write: vi.fn() };
    const store_ = createCachingWalSnapshotStore(inner);

    await expect(store_.read('k__snapshot')).resolves.toEqual(snap);
    await expect(store_.read('k__snapshot')).resolves.toEqual(snap);
  });

  it('returns null when offline with nothing cached', async () => {
    const inner = { read: vi.fn().mockRejectedValue(netErr()), write: vi.fn() };
    await expect(createCachingWalSnapshotStore(inner).read('k__snapshot')).resolves.toBeNull();
  });

  it('rethrows a non-network read failure', async () => {
    const boom = Object.assign(new Error('nope'), { status: 500 });
    const inner = { read: vi.fn().mockRejectedValue(boom), write: vi.fn() };
    await expect(createCachingWalSnapshotStore(inner).read('k__snapshot')).rejects.toBe(boom);
  });
});

describe('clearWalCache', () => {
  it('removes the element log, the outbox, and the cached snapshot', async () => {
    const inner: WalTransport = {
      pull: vi.fn().mockResolvedValue([el(10)]),
      append: vi.fn().mockRejectedValue(netErr()),
    };
    const transport = createCachingWalTransport(inner);
    await transport.pull(DOC, 0);
    await transport.append(DOC, { data: {}, authorPubkey: 'a', authorSignature: 's' });
    await createCachingWalSnapshotStore({
      read: vi.fn().mockResolvedValue({ state: {}, uptoTs: 1, writerSeq: {}, producedBy: 'a', authorPubkey: 'a', authorSignature: 's' }),
      write: vi.fn(),
    }).read(`${DOC}__snapshot`);
    expect(store.size).toBe(3);

    await clearWalCache(DOC);
    expect(store.size).toBe(0);
  });
});

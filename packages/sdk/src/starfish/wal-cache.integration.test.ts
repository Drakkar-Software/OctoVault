/**
 * End-to-end offline round-trip against a REAL {@link WalDocument}: real Ed25519
 * author proofs, real verify/fold, real checkpoint arithmetic. The unit tests in
 * `wal-cache.test.ts` mock the transport and so never exercise the parts most
 * likely to be subtly wrong — that a cached element still passes author
 * verification, that a replayed outbox entry folds without poisoning the
 * checkpoint, and that two replicas converge afterwards.
 */
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { configurePlatform } from '@drakkar.software/starfish-protocol';
import { ed25519 } from '@noble/curves/ed25519.js';
import {
  WalDocument,
  createEd25519Signer,
  noopEncryptor,
  type WalAppendElement,
  type WalSigner,
  type WalTransport,
} from '@drakkar.software/starfish-wal';

import { configureKv } from '../config/kv';
import { createCachingWalTransport, flushWalOutbox, readWalOutbox } from './wal-cache';

import { vi } from 'vitest';
vi.mock('@drakkar.software/dk-spaces-sdk', () => ({ configureKv: () => {} }));

// Node's vitest has no btoa/atob — wire base64 so the protocol's author signer works.
beforeAll(() => {
  if (typeof globalThis.btoa !== 'function') {
    configurePlatform({
      base64: {
        encode: (data) => Buffer.from(data).toString('base64'),
        decode: (str) => new Uint8Array(Buffer.from(str, 'base64')),
      },
    });
  }
});

const DOC = 'spaces/sp1/objects/pages/pg1';

const hex = (b: Uint8Array) => [...b].map((x) => x.toString(16).padStart(2, '0')).join('');

function newSigner(): WalSigner {
  const priv = ed25519.utils.randomSecretKey();
  return createEd25519Signer(hex(ed25519.getPublicKey(priv)), hex(priv));
}

/** One append-only collection, plus a switch that fails like an unreachable host. */
class FakeServer implements WalTransport {
  readonly els: WalAppendElement[] = [];
  offline = false;
  private ts = 0;

  private guard() {
    if (this.offline) throw new Error('Failed to fetch');
  }
  async append(_key: string, body: { data: Record<string, unknown> } & { authorPubkey: string; authorSignature: string }) {
    this.guard();
    this.ts += 1;
    this.els.push({ ts: this.ts, ...body });
    return { ts: this.ts };
  }
  async pull(_key: string, checkpoint: number) {
    this.guard();
    return this.els.filter((e) => e.ts > checkpoint);
  }
}

/** A fresh KV, as a device that has never seen this document. */
function useFreshKv() {
  const store = new Map<string, string>();
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
  return store;
}

let server: FakeServer;
let signer: WalSigner;

/** A brand-new WalDocument over the same server + KV — models an app restart,
 *  since nothing but the KV survives. */
function openable(s: WalSigner = signer) {
  return new WalDocument({
    documentKey: DOC,
    transport: createCachingWalTransport(server),
    signer: s,
    encryptor: noopEncryptor,
  });
}

beforeEach(() => {
  useFreshKv();
  server = new FakeServer();
  signer = newSigner();
});

describe('offline WAL round-trip', () => {
  it('reads cached content, survives a restart, and converges once flushed', async () => {
    // 1. Online: write a title, which lands on the server and in the element cache.
    const d1 = openable();
    await d1.open();
    d1.setField('title', 'Hello');
    await d1.commit();
    expect(server.els).toHaveLength(1);

    // 2. Offline cold start: a fresh document materializes from the cache alone.
    server.offline = true;
    const d2 = openable();
    await d2.open();
    expect(d2.materialize().title).toBe('Hello');
    // The checkpoint tracks the real server ts, never a synthetic one.
    expect(d2.currentCheckpoint).toBe(1);

    // 3. An offline edit is parked, not lost — and commit() still resolves.
    d2.setField('body', 'written on a train');
    await expect(d2.commit()).resolves.toEqual({ ts: 0 });
    expect(await readWalOutbox(DOC)).toHaveLength(1);
    expect(server.els).toHaveLength(1);

    // 4. Kill the app while still offline. Only the KV survives — the parked commit
    //    must come back, and must fold on top of the cached log.
    const d3 = openable();
    await d3.open();
    expect(d3.materialize()).toMatchObject({ title: 'Hello', body: 'written on a train' });
    // The replayed entry was folded at the checkpoint, so it cannot advance past
    // the real element the server still owes us.
    expect(d3.currentCheckpoint).toBe(1);

    // 5. Back online: the outbox drains against the live transport.
    server.offline = false;
    await expect(flushWalOutbox(DOC, server)).resolves.toBe(1);
    expect(server.els).toHaveLength(2);
    expect(await readWalOutbox(DOC)).toEqual([]);

    // 6. A second device, cold, with its own KV, sees both writes — meaning the
    //    replayed element still carried a valid author proof after a KV round-trip.
    useFreshKv();
    const reader = openable(newSigner());
    await reader.open();
    expect(reader.materialize()).toMatchObject({ title: 'Hello', body: 'written on a train' });
    expect(reader.currentCheckpoint).toBe(2);
  });

  it('folds a flushed entry exactly once — a re-pull of the same op is a no-op', async () => {
    const d1 = openable();
    await d1.open();
    d1.setField('title', 'Hello');
    await d1.commit();

    server.offline = true;
    const d2 = openable();
    await d2.open();
    d2.setField('n', 1);
    await d2.commit();

    server.offline = false;
    await flushWalOutbox(DOC, server);
    // d2 already folded its own op locally; pulling the server's copy of the very
    // same op-batch must converge rather than double-apply.
    await d2.pull();
    expect(d2.materialize()).toMatchObject({ title: 'Hello', n: 1 });
    expect(d2.currentCheckpoint).toBe(2);
  });

  it('opens to an empty document when offline with nothing cached', async () => {
    server.offline = true;
    const d = openable();
    await expect(d.open()).resolves.toBeUndefined();
    expect(d.materialize()).toEqual({});
  });

  it('still rejects open() when the server answers with a hard failure', async () => {
    const denied = Object.assign(new Error('forbidden'), { status: 403 });
    const failing: WalTransport = {
      async pull() {
        throw denied;
      },
      async append() {
        throw denied;
      },
    };
    const d = new WalDocument({
      documentKey: DOC,
      transport: createCachingWalTransport(failing),
      signer,
      encryptor: noopEncryptor,
    });
    await expect(d.open()).rejects.toBe(denied);
  });
});

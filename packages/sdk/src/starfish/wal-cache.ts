/**
 * Offline-first wiring for a {@link WalDocument}: a cache-backed
 * {@link WalTransport} plus a persisted outbox of un-pushed commits.
 *
 * WHY THIS EXISTS. `StarfishClient.pull` already serves a stale cached response
 * when the network throws — but *only* for document pulls. An append-log pull
 * (which is what a WAL op-log is) sets `appendField`, and the client skips its
 * cache entirely for those. So a page whose keyring and snapshot both resolve
 * happily from cache still fails to open the moment the op-log tail can't be
 * fetched. This module closes that one gap, on both the read and the write side:
 *
 * - **Reads.** Every successfully pulled element is mirrored to the KV store,
 *   still sealed and still carrying its author proof — exactly the bytes the
 *   server returned. When a pull fails with a network error we replay them from
 *   KV instead. `WalDocument` then verifies and decrypts them on the way in, as
 *   it would for a live pull, so caching grants a reader no authority it did not
 *   already have. Non-network failures (403, 5xx, a malformed body) still throw.
 *
 * - **Writes.** A commit that can't reach the server is parked in a per-document
 *   outbox and replayed by {@link flushWalOutbox} once a pull or an online edge
 *   proves the server is back. Because a commit is sealed and signed *before* it
 *   reaches the transport, an outbox entry is a complete, self-authenticating
 *   append element: replaying it needs no key material and no live session, which
 *   is what lets it survive the app being killed.
 *
 * Both caches hold ciphertext only. The op-batch envelopes and the snapshot
 * `state` are sealed with the space CEK, so a device with a KV dump but no
 * keyring learns nothing beyond element counts and timestamps.
 *
 * This module also owns open-time SPEED: the snapshot read is served
 * stale-while-revalidate from the client's pull cache
 * ({@link createSwrWalSnapshotStore}), and `maybeCompact` (returned by
 * {@link createOfflineWalDocument}) checkpoints a long log after a slow open so
 * the next one resumes from the snapshot instead of replaying full history.
 */
import { WalDocument } from '@drakkar.software/starfish-wal';
import type {
  WalAppendElement,
  WalSnapshotDoc,
  WalSnapshotStore,
  WalTransport,
} from '@drakkar.software/starfish-wal';
import {
  createWalSnapshotStore,
  createWalTransport,
  noopEncryptor,
  walEncryptorFromKeyring,
  walSignerFromKeys,
} from '@drakkar.software/starfish-wal/client';
import type { CreateWalDocumentOptions, WalStarfishClient } from '@drakkar.software/starfish-wal/client';

import { classifyError } from '../domain/errors';
import { kvGet, kvRemove, kvSet } from '../config/kv';

/** One un-pushed commit: the sealed op-batch plus its Ed25519 author proof —
 *  precisely the body `WalTransport.append` takes. */
export interface WalOutboxEntry {
  data: Record<string, unknown>;
  authorPubkey: string;
  authorSignature: string;
}

const elementsKey = (documentKey: string) => `octovault.walcache.${documentKey}`;
const outboxKey = (documentKey: string) => `octovault.waloutbox.${documentKey}`;
/** Mirrors `WalDocument`'s own sibling-collection naming. */
const snapshotCacheKey = (snapshotKey: string) => `octovault.walsnap.${snapshotKey}`;

async function readJson<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await kvGet(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback; // a corrupt entry is a cold start, never a hard failure
  }
}

/** Best-effort write, for caches whose loss costs a re-fetch and nothing more. */
async function writeJson(key: string, value: unknown): Promise<void> {
  try {
    await kvSet(key, JSON.stringify(value));
  } catch {
    /* a full/unavailable KV must not fail the pull that triggered the write */
  }
}

/** Throwing write, for the outbox — the one store whose contents are the ONLY
 *  copy of a user's edit. A swallowed failure here reads as "commit persisted",
 *  and `WalDocument.commit()` would drop the ops on the floor. */
async function writeJsonOrThrow(key: string, value: unknown): Promise<void> {
  await kvSet(key, JSON.stringify(value));
}

/** True when `e` is a transport failure — the only class for which serving a
 *  stale element list, or parking a commit, is the right answer. */
const isOffline = (e: unknown): boolean => classifyError(e) === 'network';

// ── Element cache ──────────────────────────────────────────────────────────────

/** Merge freshly pulled elements into the cached log, de-duplicated by `ts` and
 *  kept in ascending `ts` order (the order `WalDocument` folds them in). */
async function cacheElements(documentKey: string, incoming: readonly WalAppendElement[]): Promise<void> {
  if (incoming.length === 0) return;
  const key = elementsKey(documentKey);
  const existing = await readJson<WalAppendElement[]>(key, []);
  const byTs = new Map(existing.map((el) => [el.ts, el]));
  for (const el of incoming) byTs.set(el.ts, el);
  await writeJson(key, [...byTs.values()].sort((a, b) => a.ts - b.ts));
}

// ── Outbox ─────────────────────────────────────────────────────────────────────

/** The commits this device has authored but not yet handed to the server. */
export async function readWalOutbox(documentKey: string): Promise<WalOutboxEntry[]> {
  return readJson<WalOutboxEntry[]>(outboxKey(documentKey), []);
}

/** Drop every persisted trace of one document — its element log, its snapshot,
 *  and any un-pushed commits. Call when the object is archived or recreated: a
 *  surviving outbox would otherwise push content back at a document the user
 *  just gave up on. */
export async function clearWalCache(documentKey: string): Promise<void> {
  const keys = [elementsKey(documentKey), outboxKey(documentKey), snapshotCacheKey(`${documentKey}__snapshot`)];
  await Promise.all(keys.map((k) => kvRemove(k).catch(() => {})));
}

/**
 * Replay parked commits, oldest first, stopping at the first failure so the
 * per-author sequence inside the envelopes stays contiguous. Returns how many the
 * server accepted. Safe to run alongside a pull: an entry that reaches the server
 * twice folds to a no-op (CRDT ops are idempotent).
 *
 * A commit the server *rejects* (revoked cap, malformed batch) is discarded, since
 * it would otherwise wedge every later edit behind an entry that can never land.
 * Be clear about the cost: those ops stay folded in this device's document but will
 * never reach the server, so this replica has silently diverged. Nothing re-sends
 * them — a CRDT op is appended once. Dropping is the lesser evil, not a repair.
 */
export async function flushWalOutbox(documentKey: string, transport: WalTransport): Promise<number> {
  const queued = await readWalOutbox(documentKey);
  if (queued.length === 0) return 0;

  let pushed = 0;
  /** How many entries leave the queue — the accepted ones, plus a rejected one. */
  let consumed = 0;
  try {
    for (const entry of queued) {
      const { ts } = await transport.append(documentKey, entry);
      await cacheElements(documentKey, [{ ts, ...entry }]);
      pushed += 1;
      consumed += 1;
    }
  } catch (e) {
    if (!isOffline(e)) consumed += 1; // discard the rejected entry, keep the rest
  }
  await writeJson(outboxKey(documentKey), queued.slice(consumed));
  return pushed;
}

// ── Transport ──────────────────────────────────────────────────────────────────

/**
 * Wrap a live {@link WalTransport} so pulls fall back to the cached element log
 * and appends fall back to the outbox.
 *
 * The subtle part is the `ts` stamped on replayed outbox entries. `WalDocument`
 * advances its checkpoint to the highest `ts` it folds, and pulls everything
 * *after* that checkpoint next time. An un-pushed commit has no server `ts` yet,
 * so it is handed back at exactly the incoming `checkpoint`: high enough to be
 * folded (which keeps offline edits on screen and, just as importantly, lets the
 * Lamport clock observe them so the next session's ops sort after them), low
 * enough that it can never advance the checkpoint past a real element the server
 * still owes us.
 */
export function createCachingWalTransport(
  inner: WalTransport,
  onReachable?: (up: boolean) => void,
): WalTransport {
  return {
    async pull(documentKey, checkpoint) {
      let fresh: WalAppendElement[];
      try {
        fresh = await inner.pull(documentKey, checkpoint);
        onReachable?.(true);
        await cacheElements(documentKey, fresh);
      } catch (e) {
        if (!isOffline(e)) throw e;
        onReachable?.(false);
        const cached = await readJson<WalAppendElement[]>(elementsKey(documentKey), []);
        fresh = cached.filter((el) => el.ts > checkpoint);
      }

      const queued = await readWalOutbox(documentKey);
      if (queued.length === 0) return fresh;
      return [...fresh, ...queued.map((entry) => ({ ts: checkpoint, ...entry }))];
    },

    async append(documentKey, body) {
      try {
        const res = await inner.append(documentKey, body);
        onReachable?.(true);
        await cacheElements(documentKey, [{ ts: res.ts, ...body }]);
        return res;
      } catch (e) {
        if (!isOffline(e)) throw e;
        onReachable?.(false);
        const queued = await readWalOutbox(documentKey);
        // If the outbox write fails (a full KV), rethrow the TRANSPORT error rather
        // than reporting success. `commit()` then keeps its pending ops in memory,
        // so the edit survives the session and is re-tried on the next commit —
        // whereas a swallowed failure here would destroy it outright.
        await writeJsonOrThrow(outboxKey(documentKey), [...queued, body]).catch(() => {
          throw e;
        });
        // Report success so `WalDocument.commit()` clears its pending ops: they
        // are now durable in the outbox, and leaving them queued in memory would
        // re-send them on the next commit under a *different* sequence number.
        // The `ts` is never read back — the checkpoint only advances from `pull`.
        return { ts: 0 };
      }
    },
  };
}

/**
 * Snapshot store whose `read` goes through the StarfishClient pull cache with
 * `staleWhileRevalidate: true`: a previously-seen snapshot is adopted instantly
 * (no round-trip; a background revalidation refreshes the cache for the next
 * open), and a stale one only means a longer tail pull. `write` delegates to the
 * upstream store, keeping its hash-CAS + retry.
 *
 * Unlike the upstream store's read — which swallows every failure into `null`
 * (= "no snapshot, cold start") — this one rethrows NETWORK failures, so the
 * {@link createCachingWalSnapshotStore} wrapper can serve its KV mirror instead
 * of silently downgrading an offline open to a full-history replay.
 */
export function createSwrWalSnapshotStore(client: WalStarfishClient): WalSnapshotStore {
  const upstream = createWalSnapshotStore(client);
  return {
    async read(snapshotKey) {
      let res: { data?: unknown } | null = null;
      try {
        res = await client.pull(`/pull/${snapshotKey}`, { staleWhileRevalidate: true });
      } catch (e) {
        if (isOffline(e)) throw e; // let the caching wrapper fall back to KV
        return null; // 404 = no snapshot yet; any other answer = cold start
      }
      const data = (res?.data ?? null) as WalSnapshotDoc | null;
      if (!data || typeof data.uptoTs !== 'number' || !data.state) return null;
      return data;
    },
    write: (snapshotKey, doc) => upstream.write(snapshotKey, doc),
  };
}

/** Wrap the snapshot store so a cold start offline still adopts the last
 *  snapshot instead of rejecting the whole `open()`. The snapshot carries its own
 *  `producedBy` + signature, which `WalDocument` verifies after we hand it back. */
export function createCachingWalSnapshotStore(
  inner: WalSnapshotStore,
  onReachable?: (up: boolean) => void,
): WalSnapshotStore {
  return {
    async read(snapshotKey) {
      try {
        const doc = await inner.read(snapshotKey);
        onReachable?.(true);
        if (doc) await writeJson(snapshotCacheKey(snapshotKey), doc);
        return doc;
      } catch (e) {
        if (!isOffline(e)) throw e;
        onReachable?.(false);
        return readJson<WalSnapshotDoc | null>(snapshotCacheKey(snapshotKey), null);
      }
    },
    async write(snapshotKey, doc) {
      await inner.write(snapshotKey, doc);
      await writeJson(snapshotCacheKey(snapshotKey), doc);
    },
  };
}

// ── Factory ────────────────────────────────────────────────────────────────────

export interface CreateOfflineWalDocumentOptions extends CreateWalDocumentOptions {
  /** Called with the outcome of every real network round-trip, so the app's
   *  connectivity signal reflects actual traffic rather than `navigator.onLine`. */
  onReachable?: (up: boolean) => void;
}

/**
 * Tail cap passed as the doc's `retainTailN` AND used as the compaction
 * threshold — the two must agree: `retainedTail()` is capped at `retainTailN`,
 * so "the tail reached the cap" is exactly "this open replayed at least this
 * many elements".
 */
export const WAL_COMPACT_TAIL_N = 64;

/**
 * The offline-first counterpart of `createWalDocument`: same wiring, but the
 * transport and snapshot store are cache-backed. Returns the document alongside
 * the transport, which the caller needs to drive {@link flushWalOutbox}, and
 * `maybeCompact`, which the caller fires after a slow `open()`.
 */
export function createOfflineWalDocument(opts: CreateOfflineWalDocumentOptions): {
  doc: WalDocument;
  transport: WalTransport;
  /**
   * Checkpoint the op-log when the just-finished `open()` replayed a full
   * `retainTailN` tail, so the NEXT open adopts the snapshot instead of
   * re-verifying/decrypting/folding the whole history from ts=0
   * (`doc.snapshot()` had no caller before this, so opens got slower with
   * every commit — the root cause of a sluggish "Opening page…").
   *
   * Fire-and-forget. Every failure (CAS race with another device compacting,
   * offline, a server without the snapshot collection) is benign — the open
   * already succeeded, only the next-open speedup is lost. Returns whether a
   * snapshot was written.
   */
  maybeCompact: () => Promise<boolean>;
} {
  const { client, documentKey, edPubHex, edPrivHex, encryptor, onReachable, sessionNonce, posture, withSnapshots } = opts;

  const live = createWalTransport(client);
  const signer = walSignerFromKeys(edPubHex, edPrivHex);
  const walEncryptor = encryptor ? walEncryptorFromKeyring(encryptor) : noopEncryptor;
  const snapshotStore =
    withSnapshots === false ? undefined : createCachingWalSnapshotStore(createSwrWalSnapshotStore(client), onReachable);

  const doc = new WalDocument({
    documentKey,
    transport: createCachingWalTransport(live, onReachable),
    signer,
    encryptor: walEncryptor,
    ...(snapshotStore ? { snapshotStore } : {}),
    ...(sessionNonce ? { sessionNonce } : {}),
    ...(posture ? { posture } : {}),
    retainTailN: WAL_COMPACT_TAIL_N,
  });

  const maybeCompact = async (): Promise<boolean> => {
    if (!snapshotStore) return false;
    try {
      if (doc.retainedTail().length < WAL_COMPACT_TAIL_N) return false;
      // A throwaway document on the LIVE transport — `snapshot()` re-pulls the
      // full history itself (no `open()` needed) and MUST see the server's log,
      // not the cache: folding a partial cached tail through the caching
      // transport during a network flake would publish a truncated snapshot.
      // Offline, the live pull throws and the compaction is skipped. The server
      // log also never contains parked outbox commits, so a snapshot written
      // here can't publish an op the server hasn't accepted.
      const compactor = new WalDocument({
        documentKey,
        transport: live,
        signer,
        encryptor: walEncryptor,
        snapshotStore,
      });
      await compactor.snapshot();
      return true;
    } catch {
      return false;
    }
  };

  // The LIVE transport, deliberately: `flushWalOutbox` must see a real network
  // failure rather than have the caching wrapper re-park the entry it is draining.
  return { doc, transport: live, maybeCompact };
}

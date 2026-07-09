import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import type { Encryptor, StarfishClient } from '@drakkar.software/starfish-client';
import type { WalDocument } from '@drakkar.software/starfish-wal';

import { classifyError, createOfflineWalDocument, flushWalOutbox, humanizeError } from '@drakkar.software/octovault-sdk';
import type { ErrorKind, WalTransport } from '@drakkar.software/octovault-sdk';

import { reportReachability, subscribeOnline } from './connectivity';

export interface WalDocHandle {
  /** The opened WAL document, or null until `open()` resolves. */
  doc: WalDocument | null;
  /** True once the document is open and safe to mutate. */
  ready: boolean;
  /** True while `open()` is in flight. */
  opening: boolean;
  /** Non-null if `open()` rejected for a reason the user must see. A network
   *  failure is NOT an error here — it degrades to {@link offline} instead. */
  openError: string | null;
  /** Why {@link openError} happened, so a caller can pick a recovery affordance.
   *  Never `'network'` (that path sets `offline`). */
  openErrorKind: ErrorKind | null;
  /** The server is unreachable: the doc is being read from — and written to — the
   *  local cache. Edits are durable and push themselves when connectivity returns. */
  offline: boolean;
  /** Re-render token: bumped on every local mutation, pull, and commit. Read it in
   *  a `useMemo` dep so a projection (blocks / board) recomputes when state changes. */
  version: number;
  /** Re-render after mutating the WAL doc in place (the doc is mutable; React needs
   *  a nudge), then debounce-commit the queued ops as one op-batch. */
  touch: () => void;
  /** Fold anything appended since the last checkpoint (live updates). */
  pull: () => void;
  /** Tear down and re-open (after an open error / account switch). */
  reload: () => void;
}

export interface UseWalDocOptions {
  client: StarfishClient | null;
  /** Space keyring encryptor (private space) or null (plaintext/public). */
  encryptor?: Encryptor | null;
  /** Bare storage key, e.g. `spaces/{spaceId}/objects/pages/{id}`. */
  documentKey: string;
  edPubHex?: string;
  edPrivHex?: string;
  enabled: boolean;
  /** Debounce window before a burst of edits is committed as one batch. */
  commitDelayMs?: number;
}

/**
 * Lifecycle owner for one {@link WalDocument}: opens it once its deps resolve
 * (client + device keys; encryptor for a private space), exposes a `version`
 * token so projections recompute, debounce-commits queued ops, and folds new
 * elements on demand. The space client + encryptor come from `useRoomOpen` (see
 * {@link usePage} / {@link useBoard}); this hook is the WAL counterpart of the
 * union-merge `useMergeDoc`.
 *
 * The document is cache-backed (`createOfflineWalDocument`), so `open()` resolves
 * from the local element log when the server is unreachable and commits made in
 * that state are parked in a persisted outbox. That means a network failure never
 * produces an `openError` — it sets {@link WalDocHandle.offline} instead, and the
 * outbox drains on the next online edge. The remaining `openError` cases are real:
 * a keyring that can't decrypt the log, or a server that answered and refused.
 */
export function useWalDoc(opts: UseWalDocOptions): WalDocHandle {
  const { client, encryptor, documentKey, edPubHex, edPrivHex, enabled, commitDelayMs = 400 } = opts;
  const [doc, setDoc] = useState<WalDocument | null>(null);
  const [opening, setOpening] = useState(false);
  const [openError, setOpenError] = useState<string | null>(null);
  const [openErrorKind, setOpenErrorKind] = useState<ErrorKind | null>(null);
  const [offline, setOffline] = useState(false);
  const [version, bump] = useReducer((x: number) => x + 1, 0);
  const [reloadKey, reload] = useReducer((x: number) => x + 1, 0);
  const commitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** The LIVE transport for this doc — `flushWalOutbox` must bypass the caching
   *  wrapper, or draining the outbox would just re-park every entry. */
  const transport = useRef<WalTransport | null>(null);

  useEffect(() => {
    setDoc(null);
    setOpenError(null);
    setOpenErrorKind(null);
    setOffline(false);
    transport.current = null;
    if (!enabled || !client || !edPubHex || !edPrivHex) return;
    let cancelled = false;
    setOpening(true);

    const { doc: d, transport: live } = createOfflineWalDocument({
      // TODO: remove cast when starfish-wal is bumped to alpha.32 — its WalStarfishClient.pull
      // is a single-signature function while StarfishClient.pull is overloaded; runtime-compatible.
      client: client as never,
      documentKey,
      edPubHex,
      edPrivHex,
      encryptor: encryptor ?? null,
      // Every real round-trip corrects the connectivity signal, so `offline`
      // tracks whether THIS document reached the server rather than whatever
      // `navigator.onLine` (web) or the SSE proxy (native) currently believes.
      onReachable: (up) => {
        reportReachability(up);
        if (!cancelled) setOffline(!up);
      },
    });
    transport.current = live;

    d.open()
      .then(() => {
        if (cancelled) return;
        setDoc(d);
        setOpening(false);
        bump();
        // A commit parked by an earlier session is still owed to the server.
        void flushWalOutbox(documentKey, live).then((sent) => {
          if (sent > 0 && !cancelled) bump();
        });
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setOpening(false);
        // The caching transport already absorbed the connectivity cases, so
        // anything reaching here answered or failed for a reason the user must
        // see. Only a confirmed crypto failure earns the destructive recovery UI.
        const kind = classifyError(e);
        if (kind === 'network') {
          setOffline(true);
          reportReachability(false);
          return;
        }
        setOpenErrorKind(kind);
        setOpenError(humanizeError(e, 'Could not open the document. Try again.'));
      });
    return () => {
      cancelled = true;
      if (commitTimer.current) clearTimeout(commitTimer.current);
    };
    // documentKey is derived from spaceId+objectId which are stable per mount.
  }, [client, encryptor, documentKey, edPubHex, edPrivHex, enabled, reloadKey]);

  const pull = useCallback(() => {
    if (!doc) return;
    void doc
      .pull()
      .then((folded) => {
        if (folded > 0) bump();
      })
      .catch(() => {});
  }, [doc]);

  // Drain the outbox the moment connectivity returns, then fold whatever the
  // server accepted while we were away. Deliberately NOT a `reload()`: re-opening
  // would throw away any ops still sitting in the debounce window.
  useEffect(() => {
    if (!doc) return;
    return subscribeOnline((online) => {
      const live = transport.current;
      if (!online || !live) return;
      void flushWalOutbox(documentKey, live).then(() => pull());
    });
  }, [doc, documentKey, pull]);

  // Render the optimistic local state immediately, then flush queued ops as one
  // commit after the debounce window; bump again once the server ts lands. When
  // offline the commit is parked in the outbox and still resolves, so `pending`
  // is cleared exactly once and never re-sent under a second sequence number.
  const touch = useCallback(() => {
    bump();
    if (!doc) return;
    if (commitTimer.current) clearTimeout(commitTimer.current);
    commitTimer.current = setTimeout(() => {
      void doc.commit().then(() => bump()).catch(() => {});
    }, commitDelayMs);
  }, [doc, commitDelayMs]);

  return { doc, ready: !!doc, opening, openError, openErrorKind, offline, version, touch, pull, reload };
}

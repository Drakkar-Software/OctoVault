import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import type { Encryptor, StarfishClient } from '@drakkar.software/starfish-client';
import type { WalDocument } from '@drakkar.software/starfish-wal';

import { createWalDocument, humanizeError } from '@drakkar.software/octovault-sdk';

export interface WalDocHandle {
  /** The opened WAL document, or null until `open()` resolves. */
  doc: WalDocument | null;
  /** True once the document is open and safe to mutate. */
  ready: boolean;
  /** True while `open()` is in flight. */
  opening: boolean;
  /** Non-null if `open()` rejected. Includes the HTTP status for 404/403 discrimination. */
  openError: string | null;
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
 */
export function useWalDoc(opts: UseWalDocOptions): WalDocHandle {
  const { client, encryptor, documentKey, edPubHex, edPrivHex, enabled, commitDelayMs = 400 } = opts;
  const [doc, setDoc] = useState<WalDocument | null>(null);
  const [opening, setOpening] = useState(false);
  const [openError, setOpenError] = useState<string | null>(null);
  const [version, bump] = useReducer((x: number) => x + 1, 0);
  const [reloadKey, reload] = useReducer((x: number) => x + 1, 0);
  const commitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setDoc(null);
    setOpenError(null);
    if (!enabled || !client || !edPubHex || !edPrivHex) return;
    let cancelled = false;
    setOpening(true);
    const d = createWalDocument({
      client,
      documentKey,
      edPubHex,
      edPrivHex,
      encryptor: encryptor ?? null,
    });
    d.open()
      .then(() => {
        if (!cancelled) {
          setDoc(d);
          setOpening(false);
          bump();
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setOpening(false);
          setOpenError(humanizeError(e, 'Could not open the document. Try again.'));
        }
      });
    return () => {
      cancelled = true;
      if (commitTimer.current) clearTimeout(commitTimer.current);
    };
    // documentKey is derived from spaceId+objectId which are stable per mount.
  }, [client, encryptor, documentKey, edPubHex, edPrivHex, enabled, reloadKey]);

  // Render the optimistic local state immediately, then flush queued ops as one
  // commit after the debounce window; bump again once the server ts lands.
  const touch = useCallback(() => {
    bump();
    if (!doc) return;
    if (commitTimer.current) clearTimeout(commitTimer.current);
    commitTimer.current = setTimeout(() => {
      void doc.commit().then(() => bump()).catch(() => {});
    }, commitDelayMs);
  }, [doc, commitDelayMs]);

  const pull = useCallback(() => {
    if (!doc) return;
    void doc
      .pull()
      .then((folded) => {
        if (folded > 0) bump();
      })
      .catch(() => {});
  }, [doc]);

  return { doc, ready: !!doc, opening, openError, version, touch, pull, reload };
}
